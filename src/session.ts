/**
 * Session management for Claude Telegram Bot.
 *
 * Per-user ClaudeSession instances. Each Telegram user gets isolated session
 * state, history file, working dir, allowed paths and system prompt — driven by
 * the UserProfile from config.
 */

import {
  query,
  type Options,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "fs";
import * as fs from "fs";
import * as path from "path";
import type { Context } from "grammy";
import {
  MCP_SERVERS,
  SHOW_THINKING,
  SHOW_TOOL_USE,
  STREAMING_THROTTLE_MS,
  TEMP_PATHS,
  THINKING_DEEP_KEYWORDS,
  THINKING_KEYWORDS,
  getUserProfile,
  type UserProfile,
} from "./config";
import { formatToolStatus } from "./formatting";
import {
  checkPendingAskUserRequests,
  checkPendingSendFileRequests,
} from "./handlers/streaming";
import { TranscriptRecorder } from "./memory/transcript";
import { GraphStore } from "./memory/graph";
import { GoalsStore } from "./memory/goals";
import { analyzeSession } from "./memory/analyzer";
import { buildMemoryContext } from "./memory/inject";
import { summaryFile } from "./memory/paths";
import { heuristicTopicCheck, llmTopicCheck } from "./memory/topic-detector";
import { checkCommandSafety, isPathAllowedFor } from "./security";
import type {
  SavedSession,
  SessionHistory,
  StatusCallback,
  TokenUsage,
} from "./types";

/**
 * Determine thinking token budget based on message keywords.
 */
function getThinkingLevel(message: string): number {
  const msgLower = message.toLowerCase();

  if (THINKING_DEEP_KEYWORDS.some((k) => msgLower.includes(k))) {
    return 50000;
  }
  if (THINKING_KEYWORDS.some((k) => msgLower.includes(k))) {
    return 10000;
  }
  return 0;
}

const MAX_SESSIONS = 5;

export class ClaudeSession {
  readonly profile: UserProfile;

  sessionId: string | null = null;
  lastActivity: Date | null = null;
  queryStarted: Date | null = null;
  currentTool: string | null = null;
  lastTool: string | null = null;
  lastError: string | null = null;
  lastErrorTime: Date | null = null;
  lastUsage: TokenUsage | null = null;
  lastMessage: string | null = null;
  conversationTitle: string | null = null;

  private abortController: AbortController | null = null;
  private isQueryRunning = false;
  private stopRequested = false;
  private _isProcessing = false;
  private _wasInterruptedByNewMessage = false;
  private transcriptRecorder: TranscriptRecorder | null = null;

  constructor(profile: UserProfile) {
    this.profile = profile;
  }

  get isActive(): boolean {
    return this.sessionId !== null;
  }

  get isRunning(): boolean {
    return this.isQueryRunning || this._isProcessing;
  }

  consumeInterruptFlag(): boolean {
    const was = this._wasInterruptedByNewMessage;
    this._wasInterruptedByNewMessage = false;
    if (was) {
      this.stopRequested = false;
    }
    return was;
  }

  markInterrupt(): void {
    this._wasInterruptedByNewMessage = true;
  }

  clearStopRequested(): void {
    this.stopRequested = false;
  }

  startProcessing(): () => void {
    this._isProcessing = true;
    return () => {
      this._isProcessing = false;
    };
  }

  async stop(): Promise<"stopped" | "pending" | false> {
    if (this.isQueryRunning && this.abortController) {
      this.stopRequested = true;
      this.abortController.abort();
      console.log(`[${this.profile.label}] Stop requested - aborting current query`);
      return "stopped";
    }
    if (this._isProcessing) {
      this.stopRequested = true;
      console.log(`[${this.profile.label}] Stop requested - will cancel before query starts`);
      return "pending";
    }
    return false;
  }

  async sendMessageStreaming(
    message: string,
    username: string,
    userId: number,
    statusCallback: StatusCallback,
    chatId?: number,
    ctx?: Context
  ): Promise<string> {
    if (chatId) {
      process.env.TELEGRAM_CHAT_ID = String(chatId);
    }

    const isNewSession = !this.isActive;
    const thinkingTokens = getThinkingLevel(message);
    const thinkingLabel =
      { 0: "off", 10000: "normal", 50000: "deep" }[thinkingTokens] ||
      String(thinkingTokens);

    let messageToSend = message;
    if (isNewSession) {
      const now = new Date();
      const datePrefix = `[Current date/time: ${now.toLocaleDateString(
        "en-US",
        {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        }
      )}]\n\n`;
      messageToSend = datePrefix + message;
    }

    // Inject memory context into system prompt for new sessions
    let systemPromptWithMemory = this.profile.systemPrompt;
    if (isNewSession) {
      try {
        // 1. Prepend static profile.md if it exists
        const profileMdPath = path.join(
          this.profile.workingDir, "memory", String(this.profile.userId), "profile.md"
        );
        if (fs.existsSync(profileMdPath)) {
          const profileContent = fs.readFileSync(profileMdPath, "utf8").trim();
          if (profileContent) {
            systemPromptWithMemory = (this.profile.systemPrompt || "") + "\n\n" + profileContent;
          }
        }

        // 2. Append dynamic graph/goals context
        const graphStore = new GraphStore(this.profile.workingDir, this.profile.userId);
        const goalsStore = new GoalsStore(this.profile.workingDir, this.profile.userId);
        const graph = graphStore.load();
        const goals = goalsStore.load();
        const memCtx = buildMemoryContext(graph, goals, {
          maxNodes: 20,
          maxChars: 2000,
          queryHint: message,
        });
        if (memCtx.appendText) {
          systemPromptWithMemory = systemPromptWithMemory + "\n\n" + memCtx.appendText;
        }
      } catch (err) {
        console.warn(`[${this.profile.label}] Memory context load failed (non-fatal):`, err);
      }
    }

    const options: Options = {
      model: this.profile.model,
      cwd: this.profile.workingDir,
      settingSources: this.profile.settingSources,
      systemPrompt: systemPromptWithMemory,
      mcpServers: MCP_SERVERS,
      maxThinkingTokens: thinkingTokens,
      additionalDirectories: this.profile.allowedPaths,
      resume: this.sessionId || undefined,
    };

    if (process.env.CLAUDE_CODE_PATH) {
      options.pathToClaudeCodeExecutable = process.env.CLAUDE_CODE_PATH;
    }

    if (this.sessionId && !isNewSession) {
      console.log(
        `[${this.profile.label}] RESUMING session ${this.sessionId.slice(
          0,
          8
        )}... (thinking=${thinkingLabel})`
      );
    } else {
      console.log(
        `[${this.profile.label}] STARTING new Claude session (thinking=${thinkingLabel})`
      );
      this.sessionId = null;
    }

    if (this.stopRequested) {
      console.log(
        `[${this.profile.label}] Query cancelled before starting (stop was requested during processing)`
      );
      this.stopRequested = false;
      throw new Error("Query cancelled");
    }

    this.abortController = new AbortController();
    this.isQueryRunning = true;
    this.stopRequested = false;
    this.queryStarted = new Date();
    this.currentTool = null;

    const responseParts: string[] = [];
    let currentSegmentId = 0;
    let currentSegmentText = "";
    let lastTextUpdate = 0;
    let queryCompleted = false;
    let askUserTriggered = false;
    const toolsInSession: string[] = [];

    try {
      const queryInstance = query({
        prompt: messageToSend,
        options: {
          ...options,
          abortController: this.abortController,
        },
      });

      for await (const event of queryInstance) {
        if (this.stopRequested) {
          console.log(`[${this.profile.label}] Query aborted by user`);
          break;
        }

        if (!this.sessionId && event.session_id) {
          this.sessionId = event.session_id;
          console.log(
            `[${this.profile.label}] GOT session_id: ${this.sessionId!.slice(0, 8)}...`
          );
          this.saveSession();
          // Initialize transcript recorder (for both new and resumed sessions)
          try {
            this.transcriptRecorder = new TranscriptRecorder(
              this.profile.workingDir,
              this.sessionId!,
              this.profile.userId
            );
          } catch (err) {
            console.warn(`[${this.profile.label}] TranscriptRecorder init failed (non-fatal):`, err);
          }
        }

        if (event.type === "assistant") {
          for (const block of event.message.content) {
            if (block.type === "thinking") {
              const thinkingText = block.thinking;
              if (thinkingText) {
                console.log(
                  `[${this.profile.label}] THINKING BLOCK: ${thinkingText.slice(0, 100)}...`
                );
                if (SHOW_THINKING) {
                  await statusCallback("thinking", thinkingText);
                }
              }
            }

            if (block.type === "tool_use") {
              const toolName = block.name;
              const toolInput = block.input as Record<string, unknown>;

              // Bash safety
              if (toolName === "Bash") {
                const command = String(toolInput.command || "");
                const [isSafe, reason] = checkCommandSafety(
                  command,
                  this.profile.allowedPaths
                );
                if (!isSafe) {
                  console.warn(`[${this.profile.label}] BLOCKED: ${reason}`);
                  await statusCallback("tool", `BLOCKED: ${reason}`);
                  throw new Error(`Unsafe command blocked: ${reason}`);
                }
              }

              // File-op path safety
              if (["Read", "Write", "Edit"].includes(toolName)) {
                const filePath = String(toolInput.file_path || "");
                if (filePath) {
                  const isTmpRead =
                    toolName === "Read" &&
                    (TEMP_PATHS.some((p) => filePath.startsWith(p)) ||
                      // Owner can still read .claude; guests cannot.
                      (this.profile.isOwner && filePath.includes("/.claude/")));

                  if (
                    !isTmpRead &&
                    !isPathAllowedFor(filePath, this.profile.allowedPaths)
                  ) {
                    console.warn(
                      `[${this.profile.label}] BLOCKED: File access outside allowed paths: ${filePath}`
                    );
                    await statusCallback("tool", `Access denied: ${filePath}`);
                    throw new Error(`File access blocked: ${filePath}`);
                  }
                }
              }

              if (currentSegmentText) {
                await statusCallback(
                  "segment_end",
                  currentSegmentText,
                  currentSegmentId
                );
                currentSegmentId++;
                currentSegmentText = "";
              }

              const toolDisplay = formatToolStatus(toolName, toolInput);
              this.currentTool = toolDisplay;
              this.lastTool = toolDisplay;
              toolsInSession.push(toolName);
              console.log(`[${this.profile.label}] Tool: ${toolDisplay}`);

              if (
                SHOW_TOOL_USE &&
                !toolName.startsWith("mcp__ask-user") &&
                !toolName.startsWith("mcp__send-file")
              ) {
                await statusCallback("tool", toolDisplay);
              }

              if (toolName.startsWith("mcp__ask-user") && ctx && chatId) {
                await new Promise((resolve) => setTimeout(resolve, 200));
                for (let attempt = 0; attempt < 3; attempt++) {
                  const buttonsSent = await checkPendingAskUserRequests(
                    ctx,
                    chatId
                  );
                  if (buttonsSent) {
                    askUserTriggered = true;
                    break;
                  }
                  if (attempt < 2) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                  }
                }
              }

              if (toolName.startsWith("mcp__send-file") && ctx && chatId) {
                await new Promise((resolve) => setTimeout(resolve, 200));
                for (let attempt = 0; attempt < 3; attempt++) {
                  const sent = await checkPendingSendFileRequests(ctx, chatId);
                  if (sent) break;
                  if (attempt < 2) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                  }
                }
              }
            }

            if (block.type === "text") {
              responseParts.push(block.text);
              currentSegmentText += block.text;

              const now = Date.now();
              if (
                now - lastTextUpdate > STREAMING_THROTTLE_MS &&
                currentSegmentText.length > 20
              ) {
                await statusCallback(
                  "text",
                  currentSegmentText,
                  currentSegmentId
                );
                lastTextUpdate = now;
              }
            }
          }

          if (askUserTriggered) {
            break;
          }
        }

        if (event.type === "result") {
          console.log(`[${this.profile.label}] Response complete`);
          queryCompleted = true;

          if ("usage" in event && event.usage) {
            this.lastUsage = event.usage as TokenUsage;
            const u = this.lastUsage;
            console.log(
              `[${this.profile.label}] Usage: in=${u.input_tokens} out=${u.output_tokens} cache_read=${
                u.cache_read_input_tokens || 0
              } cache_create=${u.cache_creation_input_tokens || 0}`
            );
          }
        }
      }
    } catch (error) {
      const errorStr = String(error).toLowerCase();
      const isCleanupError =
        errorStr.includes("cancel") || errorStr.includes("abort");

      if (
        isCleanupError &&
        (queryCompleted || askUserTriggered || this.stopRequested)
      ) {
        console.warn(
          `[${this.profile.label}] Suppressed post-completion error: ${error}`
        );
      } else {
        console.error(`[${this.profile.label}] Error in query: ${error}`);
        this.lastError = String(error).slice(0, 100);
        this.lastErrorTime = new Date();
        throw error;
      }
    } finally {
      this.isQueryRunning = false;
      this.abortController = null;
      this.queryStarted = null;
      this.currentTool = null;
      // Flush transcript on stop/abort so partial turns are persisted
      if (this.stopRequested) {
        this.transcriptRecorder?.flush();
      }
    }

    this.lastActivity = new Date();
    this.lastError = null;
    this.lastErrorTime = null;

    if (askUserTriggered) {
      await statusCallback("done", "");
      return "[Waiting for user selection]";
    }

    if (currentSegmentText) {
      await statusCallback("segment_end", currentSegmentText, currentSegmentId);
    }

    await statusCallback("done", "");

    // Record this turn in the transcript
    const fullResponse = responseParts.join("");
    if (this.transcriptRecorder && fullResponse) {
      this.transcriptRecorder.appendUser(message);
      this.transcriptRecorder.appendAssistant(fullResponse, toolsInSession.length > 0 ? toolsInSession : undefined);

      // Incremental background analysis every 6 turns (6, 12, 18, ...)
      const turns = this.transcriptRecorder.turnCount;
      if (turns >= 6 && turns % 6 === 0) {
        const snapshot = this.transcriptRecorder.snapshot();
        const profile = this.profile;
        runBackgroundAnalysis(snapshot, profile).catch((e) =>
          console.warn(`[${profile.label}] Incremental background analysis failed:`, e)
        );
      }
    }

    return fullResponse || "No response from Claude.";
  }

  async kill(): Promise<void> {
    // Run background analysis on the closed transcript before clearing state
    if (this.transcriptRecorder) {
      const transcript = this.transcriptRecorder.close();
      this.transcriptRecorder = null;
      const profile = this.profile;
      runBackgroundAnalysis(transcript, profile).catch((e) =>
        console.warn(`[${profile.label}] Background analysis failed:`, e)
      );
    }

    this.sessionId = null;
    this.lastActivity = null;
    this.conversationTitle = null;
    console.log(`[${this.profile.label}] Session cleared`);
  }

  saveSession(): void {
    if (!this.sessionId) return;

    try {
      const history = this.loadSessionHistory();

      const newSession: SavedSession = {
        session_id: this.sessionId,
        saved_at: new Date().toISOString(),
        working_dir: this.profile.workingDir,
        title: this.conversationTitle || "Sessione senza titolo",
      };

      const existingIndex = history.sessions.findIndex(
        (s) => s.session_id === this.sessionId
      );
      if (existingIndex !== -1) {
        history.sessions[existingIndex] = newSession;
      } else {
        history.sessions.unshift(newSession);
      }

      history.sessions = history.sessions.slice(0, MAX_SESSIONS);

      Bun.write(this.profile.sessionFile, JSON.stringify(history, null, 2));
      console.log(`[${this.profile.label}] Session saved to ${this.profile.sessionFile}`);
    } catch (error) {
      console.warn(`[${this.profile.label}] Failed to save session: ${error}`);
    }
  }

  private loadSessionHistory(): SessionHistory {
    try {
      const file = Bun.file(this.profile.sessionFile);
      if (!file.size) {
        return { sessions: [] };
      }

      const text = readFileSync(this.profile.sessionFile, "utf-8");
      return JSON.parse(text) as SessionHistory;
    } catch {
      return { sessions: [] };
    }
  }

  getSessionList(): SavedSession[] {
    const history = this.loadSessionHistory();
    return history.sessions.filter(
      (s) => !s.working_dir || s.working_dir === this.profile.workingDir
    );
  }

  resumeSession(sessionId: string): [success: boolean, message: string] {
    const history = this.loadSessionHistory();
    const sessionData = history.sessions.find(
      (s) => s.session_id === sessionId
    );

    if (!sessionData) {
      return [false, "Sessione non trovata"];
    }

    if (
      sessionData.working_dir &&
      sessionData.working_dir !== this.profile.workingDir
    ) {
      return [
        false,
        `Sessione per directory diversa: ${sessionData.working_dir}`,
      ];
    }

    this.sessionId = sessionData.session_id;
    this.conversationTitle = sessionData.title;
    this.lastActivity = new Date();

    console.log(
      `[${this.profile.label}] Resumed session ${sessionData.session_id.slice(0, 8)}... - "${sessionData.title}"`
    );

    return [true, `Ripresa sessione: "${sessionData.title}"`];
  }

  resumeLast(): [success: boolean, message: string] {
    const sessions = this.getSessionList();
    if (sessions.length === 0) {
      return [false, "Nessuna sessione salvata"];
    }
    return this.resumeSession(sessions[0]!.session_id);
  }

  /**
   * Detect whether a new message is a topic change vs. continuation.
   * Used by topic-helper.ts to auto-/new on topic switch.
   */
  async checkTopicChange(message: string): Promise<boolean> {
    if (!this.isActive || !this.transcriptRecorder) return false;

    const recentTurns = this.transcriptRecorder.getRecentTurns(6);
    const lastActivityMs = this.lastActivity?.getTime();

    const heuristic = heuristicTopicCheck(recentTurns, message, lastActivityMs);
    if (heuristic.changed) return true;
    if (!heuristic.reason.startsWith("maybe-")) return false;

    // Ambiguous — ask Haiku
    try {
      const llm = await llmTopicCheck(recentTurns, message, {
        model: "claude-haiku-4-5",
        cwd: this.profile.workingDir,
      });
      return llm.changed;
    } catch (err) {
      console.warn(`[${this.profile.label}] checkTopicChange LLM failed:`, err);
      return false;
    }
  }
}

// ============== Background memory analysis ==============

async function runBackgroundAnalysis(
  transcript: import("./memory/types").SessionTranscript,
  profile: UserProfile
): Promise<void> {
  if (transcript.turns.length < 2) return;

  const store = new GraphStore(profile.workingDir, profile.userId);
  const graph = store.load();

  const result = await analyzeSession(transcript, graph, {
    model: "claude-haiku-4-5",
    cwd: profile.workingDir,
  });

  store.applyAnalysisPatch(graph, result.patch, transcript.session_id);
  store.save(graph);

  // Write session summary markdown
  const outFile = summaryFile(profile.workingDir, new Date(), profile.userId);
  fs.writeFileSync(outFile, result.summary_md, "utf8");

  console.log(
    `[${profile.label}] Memory analysis complete — ` +
    `${result.patch.upsert_nodes.length} nodes, summary saved to ${outFile}`
  );
}

// ============== Per-user session registry ==============

const sessions = new Map<number, ClaudeSession>();

export function getSession(userId: number): ClaudeSession {
  let s = sessions.get(userId);
  if (!s) {
    const profile = getUserProfile(userId);
    s = new ClaudeSession(profile);
    sessions.set(userId, s);
  }
  return s;
}

export function getAllSessions(): ClaudeSession[] {
  return Array.from(sessions.values());
}

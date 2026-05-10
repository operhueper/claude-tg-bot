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
} from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "fs";
import * as fs from "fs";
import * as path from "path";
import type { Context } from "grammy";
import {
  SHOW_THINKING,
  SHOW_TOOL_USE,
  STREAMING_THROTTLE_MS,
  TEMP_PATHS,
  THINKING_DEEP_KEYWORDS,
  THINKING_KEYWORDS,
  type UserProfile,
  isNewGuest,
  getNewGuestOpenRouterKey,
} from "./config";
import { formatToolStatus, escapeHtml } from "./formatting";
import {
  checkPendingAskUserRequests,
  checkPendingSendFileRequests,
  checkPendingConnectGoogleRequests,
} from "./handlers/streaming";
import { TranscriptRecorder } from "./memory/transcript";
import { GraphStore } from "./memory/graph";
import { GoalsStore } from "./memory/goals";
import { analyzeSession } from "./memory/analyzer";
import { buildMemoryContext } from "./memory/inject";
import { summaryFile, rebuildTopicsIndex } from "./memory/paths";
import { heuristicTopicCheck } from "./memory/topic-detector";
import { checkCommandSafety, isPathAllowedFor } from "./security";
import type {
  SavedSession,
  SessionHistory,
  StatusCallback,
  TokenUsage,
} from "./types";
import {
  queryOpenRouter,
  buildMultipartContent,
  type OpenRouterMessage,
} from "./engines/openrouter";
import { persistUserActivity } from "./session-registry";
import { mcpServersForProfile } from "./mcp-filter";
import { recordUsage, type UsageSource } from "./metering";
import { checkVaultQuota, formatBytes, VAULT_QUOTA_BYTES } from "./containers/vault-quota";
import { containerManager } from "./containers/manager";

/**
 * Hint appended to the system prompt for container-sandboxed guests so the
 * model knows to call the in-process MCP tool instead of the (disabled) Bash.
 */
const CONTAINER_BASH_PROMPT = `

ВАЖНО — РАБОЧАЯ СРЕДА:
У тебя есть инструмент для запуска shell-команд в твоей рабочей среде. Используй его для выполнения кода, обработки файлов, установки пакетов (pip install, npm install, apt-get и т.д.). Все команды работают в изолированной среде. Доступны python3, node, bun, git и обычные unix-утилиты. Состояние (установленные пакеты, файлы) сохраняется между сообщениями. Файлы созданные через инструмент Bash видны инструментам Read/Write/Edit и наоборот — это одна и та же рабочая папка.`;

/**
 * Infrastructure disclosure patterns that must not surface in guest-visible
 * thinking blocks. If any pattern matches, the block is suppressed entirely.
 */
const GUEST_THINKING_BLOCK_PATTERN =
  /\/opt\/vault|mcp__|Docker|DeepSeek|Anthropic|cgroup|OOM|exit code|claude-tg-bot|forkbomb|pids|seccomp|cap_|\/root\//i;

/**
 * Sanitize a thinking block before it is shown to a guest user.
 * Returns the original text if it is safe, or null to suppress the block.
 */
function sanitizeThinkingForGuest(text: string): string | null {
  if (GUEST_THINKING_BLOCK_PATTERN.test(text)) {
    return null;
  }
  return text;
}

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

  pendingContextMessages: string[] = [];

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

  addPendingContext(msg: string): void {
    this.pendingContextMessages.push(msg);
  }

  consumePendingContext(): string | null {
    if (this.pendingContextMessages.length === 0) return null;
    const combined = this.pendingContextMessages.join("\n\n");
    this.pendingContextMessages = [];
    return `[Дополнительный контекст от пользователя во время генерации предыдущего ответа]\n\n${combined}`;
  }

  /**
   * Build a conversation history payload for OpenRouter from the local
   * transcript recorder. Falls back to just the current message if no
   * transcript is available. Used by the new-guest OpenRouter branch.
   */
  private buildConversationHistory(
    currentMessage: string,
    mediaHint?: boolean
  ): OpenRouterMessage[] {
    const HISTORY_LIMIT = 12; // last N turns (~6 user/assistant pairs)
    const history: OpenRouterMessage[] = [];
    if (this.transcriptRecorder) {
      const turns = this.transcriptRecorder.getRecentTurns(HISTORY_LIMIT);
      for (const t of turns) {
        history.push({ role: t.role, content: t.content });
      }
    }
    // If this is a photo message, convert the last user message to multipart content
    const content = mediaHint
      ? buildMultipartContent(currentMessage)
      : currentMessage;
    history.push({ role: "user", content });
    return history;
  }

  async stop(): Promise<"stopped" | "pending" | false> {
    if (this.isQueryRunning && this.abortController) {
      this.stopRequested = true;
      this.abortController.abort();
      console.log(
        `[${this.profile.label}] Stop requested - aborting current query`
      );
      return "stopped";
    }
    if (this._isProcessing) {
      this.stopRequested = true;
      console.log(
        `[${this.profile.label}] Stop requested - will cancel before query starts`
      );
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
    ctx?: Context,
    mediaHint?: boolean,
    systemPromptOverride?: string
  ): Promise<string> {
    // Track activity for restart notifications
    if (chatId) {
      persistUserActivity(userId, chatId);
    }

    // Deliver any files that were queued but not sent in a previous session
    if (ctx && chatId) {
      await checkPendingSendFileRequests(ctx, chatId);
    }

    // Vault quota check (guests only — owner vault is bot workspace, no limit needed)
    if (!this.profile.isOwner) {
      const quota = checkVaultQuota(this.profile.userId);
      if (quota.exceeded) {
        const msg =
          `⚠️ Превышен лимит хранилища: ${formatBytes(quota.sizeBytes)} из ${formatBytes(VAULT_QUOTA_BYTES)}.\n\n` +
          `Удали ненужное в своей рабочей папке (через сообщение боту: «удали ${quota.vaultPath}/<что-то>») ` +
          `или попроси владельца расширить лимит. Пока лимит превышен — новые сообщения не обрабатываются, чтобы не сломать диск сервера.`;
        await statusCallback("segment_end", msg, 0);
        await statusCallback("done", "");
        return msg;
      }
    }

    const isNewSession = !this.isActive;
    const thinkingTokens = getThinkingLevel(message);
    const thinkingLabel =
      { 0: "off", 10000: "normal", 50000: "deep" }[thinkingTokens] ||
      String(thinkingTokens);

    let messageToSend = message;
    if (isNewSession) {
      const now = new Date();
      const tz = this.profile.timezone || "UTC";
      const datePrefix = `[Current date/time: ${now.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
        timeZone: tz,
      })}]\n\n`;
      messageToSend = datePrefix + message;
    }

    // Inject memory context into system prompt for new sessions
    let systemPromptWithMemory = systemPromptOverride ?? this.profile.systemPrompt;

    // Container-sandboxed guests: append the mcp__container__Bash usage hint.
    // Without this the model would try to call the (disabled) built-in Bash
    // tool and confuse itself.
    const useContainer =
      this.profile.containerEnabled && !this.profile.isOwner;
    if (useContainer) {
      systemPromptWithMemory =
        (systemPromptWithMemory || "") + CONTAINER_BASH_PROMPT;
    }
    if (isNewSession) {
      try {
        // 1. Prepend static profile.md if it exists
        const profileMdPath = path.join(
          this.profile.memoryRoot,
          "memory",
          String(this.profile.userId),
          "profile.md"
        );
        if (fs.existsSync(profileMdPath)) {
          const profileContent = fs
            .readFileSync(profileMdPath, "utf8")
            .trim();
          if (profileContent) {
            systemPromptWithMemory =
              (this.profile.systemPrompt || "") +
              "\n\n" +
              profileContent;
          }
        }

        // 2. Append dynamic graph/goals context
        const graphStore = new GraphStore(
          this.profile.memoryRoot,
          this.profile.userId
        );
        const goalsStore = new GoalsStore(
          this.profile.memoryRoot,
          this.profile.userId
        );
        const graph = graphStore.load();
        const goals = goalsStore.load();
        const memCtx = buildMemoryContext(graph, goals, {
          maxNodes: 20,
          maxChars: 2000,
          queryHint: message,
        });
        if (memCtx.appendText) {
          systemPromptWithMemory =
            systemPromptWithMemory + "\n\n" + memCtx.appendText;
        }
      } catch (err) {
        console.warn(
          `[${this.profile.label}] Memory context load failed (non-fatal):`,
          err
        );
      }
    }

    // ============== Universal vision routing: all users with mediaHint go via OpenRouter Gemini ==============
    if (mediaHint && process.env.OPENROUTER_API_KEY) {
      console.log(
        `[${this.profile.label}] Vision request — routing to OpenRouter Gemini`
      );
      const openrouterKey = isNewGuest(this.profile.userId)
        ? getNewGuestOpenRouterKey(this.profile.userId)
        : process.env.OPENROUTER_API_KEY;
      const msgs = this.buildConversationHistory(messageToSend, mediaHint);
      const response = await queryOpenRouter(
        msgs,
        this.profile.visionModel || "google/gemini-2.5-flash",
        openrouterKey,
        systemPromptWithMemory,
        statusCallback,
        null,
        this.profile,
        chatId
      );
      await statusCallback("segment_end", response, 0);
      await statusCallback("done", "");
      this.lastActivity = new Date();
      return response || "Нет ответа от модели.";
    }
    if (mediaHint && !process.env.OPENROUTER_API_KEY) {
      console.warn(
        `[${this.profile.label}] Vision request but OPENROUTER_API_KEY is not set`
      );
      const errMsg =
        "⚠️ OpenRouter ключ не настроен — обработка изображений недоступна.";
      await statusCallback("segment_end", errMsg, 0);
      await statusCallback("done", "");
      return errMsg;
    }
    // ============== End universal vision routing ==============

    // ============== New guest users: route via DeepSeek (or OpenRouter for text fallback) ==============
    if (isNewGuest(this.profile.userId)) {
      const deepseekKey = this.profile.deepseekApiKey;

      if (deepseekKey) {
        // Text messages: use DeepSeek via Anthropic-compatible API with native Claude CLI tools
        console.log(
          `[${this.profile.label}] Using DeepSeek via Claude CLI (native tools)`
        );
        // Falls through to the standard query() path below with DeepSeek env injected
      } else {
        // No DeepSeek key — fall back to OpenRouter for text
        const openrouterKey = getNewGuestOpenRouterKey(this.profile.userId);
        if (!openrouterKey) {
          const errMsg =
            "⚠️ Сервис временно недоступен. Обратись к администратору бота.";
          await statusCallback("segment_end", errMsg, 0);
          await statusCallback("done", "");
          return errMsg;
        }
        const msgs = this.buildConversationHistory(messageToSend, mediaHint);
        const response = await queryOpenRouter(
          msgs,
          this.profile.visionModel || "google/gemini-2.5-flash",
          openrouterKey,
          systemPromptWithMemory,
          statusCallback,
          null,
          this.profile,
          chatId
        );
        await statusCallback("segment_end", response, 0);
        await statusCallback("done", "");
        this.lastActivity = new Date();
        return response || "Нет ответа от модели.";
      }
      // DeepSeek text path: falls through to standard query() below
    }
    // ============== End new guest routing ==============

    // Container-sandboxed guests: disable the built-in Bash tool. Their
    // shell access goes through mcp__container__Bash instead (in-process MCP
    // that calls containerManager.exec). Merge with any existing disallowed
    // tools from the profile (e.g. WebSearch for DeepSeek guests).
    const disallowedTools = useContainer
      ? Array.from(
          new Set([...(this.profile.disallowedTools ?? []), "Bash"])
        )
      : this.profile.disallowedTools ?? [];

    // Build options for Claude CLI query (owner + new guests with DeepSeek key)
    const options: Options = {
      model: this.profile.model,
      cwd: this.profile.workingDir,
      settingSources: this.profile.settingSources,
      systemPrompt: systemPromptWithMemory,
      mcpServers: mcpServersForProfile(this.profile),
      maxThinkingTokens: thinkingTokens,
      additionalDirectories: this.profile.allowedPaths,
      resume: this.sessionId || undefined,
      ...(disallowedTools.length ? { disallowedTools } : {}),
      ...(this.profile.maxTurns !== undefined
        ? { maxTurns: this.profile.maxTurns }
        : {}),
    };

    // Inject DeepSeek API credentials so Claude CLI routes all LLM calls
    // (including Task-tool subagents) to DeepSeek's Anthropic-compatible endpoint.
    if (this.profile.deepseekEnv) {
      options.env = this.profile.deepseekEnv;
      console.log(`[${this.profile.label}] DeepSeek env injected`);
    }

    // Pass TELEGRAM_CHAT_ID and TELEGRAM_USER_ID per-query via subprocess env (NOT global process.env)
    // to avoid race conditions when multiple users run sessions concurrently.
    if (chatId) {
      options.env = {
        ...(options.env ?? {}),
        TELEGRAM_CHAT_ID: String(chatId),
        TELEGRAM_USER_ID: String(this.profile.userId),
      };
    }

    // S-03 security: propagate sandbox constraints so parallel_mcp subtasks
    // inherit the correct guest restrictions (vault cwd, disallowed tools,
    // settingSources). These env vars are read by parallel_mcp/server.ts.
    {
      const allowedPathsForSubtasks = this.profile.allowedPaths.join(",");
      const disallowedToolsForSubtasks = [
        "mcp__parallel__run",
        ...(this.profile.disallowedTools ?? []),
      ].join(",");
      const settingsSourcesForSubtasks = (
        this.profile.settingSources ?? ["project"]
      ).join(",");

      options.env = {
        ...(options.env ?? {}),
        TELEGRAM_PARALLEL_CWD: this.profile.workingDir,
        TELEGRAM_PARALLEL_MODEL: this.profile.model,
        TELEGRAM_PARALLEL_ALLOWED_PATHS: allowedPathsForSubtasks,
        TELEGRAM_PARALLEL_DISALLOWED_TOOLS: disallowedToolsForSubtasks,
        TELEGRAM_PARALLEL_SETTINGS_SOURCES: settingsSourcesForSubtasks,
        TELEGRAM_PARALLEL_IS_GUEST: this.profile.isOwner ? "0" : "1",
        TELEGRAM_PARALLEL_MAX_TURNS: String(
          this.profile.maxTurns ?? 10
        ),
      };
    }

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

    // Make sure the user's Docker sandbox is up before we hand off to query().
    // Lazy-creates on first call, unpauses if idle. No-op for owner / guests
    // without containerEnabled. Failing here should not break the user — if
    // Docker is unavailable, exec() will surface a clear error per request.
    if (useContainer) {
      try {
        await containerManager.getOrStart(this.profile);
      } catch (err) {
        console.warn(
          `[${this.profile.label}] container getOrStart failed (will continue, exec will report errors): ${(err as Error).message}`
        );
      }
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
    let usageRecorded = false;
    let currentUsage: TokenUsage | null = null;
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
            `[${this.profile.label}] GOT session_id: ${this.sessionId!.slice(
              0,
              8
            )}...`
          );
          this.saveSession();
          // Initialize transcript recorder (for both new and resumed sessions)
          try {
            this.transcriptRecorder = new TranscriptRecorder(
              this.profile.memoryRoot,
              this.sessionId!,
              this.profile.userId
            );
          } catch (err) {
            console.warn(
              `[${this.profile.label}] TranscriptRecorder init failed (non-fatal):`,
              err
            );
          }
        }

        if (event.type === "assistant") {
          // Capture per-turn usage early so ask-user/stop breaks (which exit
          // before the final `result` event) still have something to bill.
          // The `result` event below will overwrite this with aggregate usage
          // on a normal completion — that's the more accurate number.
          const turnUsage = (event.message as { usage?: unknown }).usage as
            | {
                input_tokens?: number;
                output_tokens?: number;
                cache_read_input_tokens?: number;
                cache_creation_input_tokens?: number;
              }
            | undefined;
          if (
            turnUsage &&
            (turnUsage.input_tokens || turnUsage.output_tokens)
          ) {
            currentUsage = {
              input_tokens: turnUsage.input_tokens || 0,
              output_tokens: turnUsage.output_tokens || 0,
              cache_read_input_tokens: turnUsage.cache_read_input_tokens,
              cache_creation_input_tokens: turnUsage.cache_creation_input_tokens,
            };
            this.lastUsage = currentUsage;
          }

          for (const block of event.message.content) {
            if (block.type === "thinking") {
              const thinkingText = block.thinking;
              if (thinkingText) {
                // For guests: redact infrastructure details from console log
                const logSnippet = this.profile.isGuest
                  ? thinkingText.replace(GUEST_THINKING_BLOCK_PATTERN, "[…]").slice(0, 100)
                  : thinkingText.slice(0, 100);
                console.log(
                  `[${this.profile.label}] THINKING BLOCK: ${logSnippet}...`
                );
                if (SHOW_THINKING) {
                  if (this.profile.isGuest) {
                    const safe = sanitizeThinkingForGuest(thinkingText);
                    if (safe !== null) {
                      await statusCallback("thinking", safe);
                    }
                    // null → suppress block entirely
                  } else {
                    await statusCallback("thinking", thinkingText);
                  }
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
                  console.warn(
                    `[${this.profile.label}] BLOCKED: ${reason}`
                  );
                  await statusCallback(
                    "tool",
                    `BLOCKED: ${escapeHtml(reason)}`
                  );
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
                      (this.profile.isOwner &&
                        filePath.includes("/.claude/")));

                  if (
                    !isTmpRead &&
                    !isPathAllowedFor(filePath, this.profile.allowedPaths)
                  ) {
                    console.warn(
                      `[${this.profile.label}] BLOCKED: File access outside allowed paths: ${filePath}`
                    );
                    await statusCallback(
                      "tool",
                      `Access denied: ${escapeHtml(filePath)}`
                    );
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
                !toolName.startsWith("mcp__send-file") &&
                !toolName.startsWith("mcp__connect-google")
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
                    await new Promise((resolve) =>
                      setTimeout(resolve, 100)
                    );
                  }
                }
              }

              if (
                toolName.startsWith("mcp__send-file") &&
                ctx &&
                chatId
              ) {
                await new Promise((resolve) => setTimeout(resolve, 200));
                for (let attempt = 0; attempt < 3; attempt++) {
                  const sent = await checkPendingSendFileRequests(
                    ctx,
                    chatId,
                    this.profile.userId
                  );
                  if (sent) break;
                  if (attempt < 2) {
                    await new Promise((resolve) =>
                      setTimeout(resolve, 100)
                    );
                  }
                }
              }

              if (
                toolName.startsWith("mcp__connect-google") &&
                ctx &&
                chatId
              ) {
                await new Promise((resolve) => setTimeout(resolve, 200));
                for (let attempt = 0; attempt < 3; attempt++) {
                  const sent = await checkPendingConnectGoogleRequests(
                    ctx,
                    chatId,
                    this.profile.userId
                  );
                  if (sent) break;
                  if (attempt < 2) {
                    await new Promise((resolve) =>
                      setTimeout(resolve, 100)
                    );
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
            const u = event.usage as TokenUsage;
            currentUsage = u;
            this.lastUsage = u;
            console.log(
              `[${this.profile.label}] Usage: in=${u.input_tokens} out=${
                u.output_tokens
              } cache_read=${
                u.cache_read_input_tokens || 0
              } cache_create=${u.cache_creation_input_tokens || 0}`
            );
          }
        }
      }
    } catch (error) {
      const errorStr = String(error).toLowerCase();
      const isAborted =
        this.stopRequested || this.abortController?.signal.aborted === true;
      // Claude CLI exit code 1 frequently lands in the catch when the SDK
      // is aborted at an unlucky moment (the subprocess exits before the
      // abort listener tags the error as AbortError). If we know the query
      // was aborted, treat exit-code-1 as cleanup noise instead of a real
      // failure — otherwise users see "process exited with code 1" every
      // time they hit /stop or send a follow-up message.
      const isCleanupError =
        errorStr.includes("cancel") ||
        errorStr.includes("abort") ||
        (isAborted &&
          (errorStr.includes("exited with code 1") ||
            errorStr.includes("exit code 1")));

      if (
        isCleanupError &&
        (queryCompleted || askUserTriggered || isAborted)
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
      // Metering — write here so tokens are accounted on every exit path:
      // normal completion, ask-user `break`, stop/abort `break`, or thrown error.
      // currentUsage is local to this call so we never double-record from a
      // previous query's leftover. `result` event provides aggregate usage;
      // assistant events provide per-turn usage as a fallback for early breaks.
      // Source is `bot-deepseek` whenever the SDK is routed through DeepSeek's
      // Anthropic-compatible endpoint via injected env-vars; otherwise
      // `bot-anthropic`. Today both owner and guests run on DeepSeek, but the
      // branch stays so the wiring still works if Anthropic comes back.
      if (!usageRecorded && currentUsage) {
        const source: UsageSource = this.profile.deepseekEnv
          ? "bot-deepseek"
          : "bot-anthropic";
        recordUsage({
          userId: this.profile.userId,
          source,
          model: this.profile.model,
          inputTokens: currentUsage.input_tokens || 0,
          outputTokens: currentUsage.output_tokens || 0,
          cacheReadTokens: currentUsage.cache_read_input_tokens,
          cacheCreationTokens: currentUsage.cache_creation_input_tokens,
        });
        usageRecorded = true;
      }
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

    // Bump container idle watchdog: keeps the sandbox warm while the user is
    // chatting, lets it auto-pause after 15 min and stop after 24 h of silence.
    if (useContainer) {
      containerManager.resetIdleTimer(this.profile.userId, this.profile);
    }

    if (askUserTriggered) {
      await statusCallback("done", "");
      return "[Waiting for user selection]";
    }

    if (currentSegmentText) {
      await statusCallback(
        "segment_end",
        currentSegmentText,
        currentSegmentId
      );
    }

    await statusCallback("done", "");

    // Record this turn in the transcript
    const fullResponse = responseParts.join("");
    if (this.transcriptRecorder && fullResponse) {
      this.transcriptRecorder.appendUser(message);
      this.transcriptRecorder.appendAssistant(
        fullResponse,
        toolsInSession.length > 0 ? toolsInSession : undefined
      );

      // Incremental background analysis every 6 turns (6, 12, 18, ...)
      const turns = this.transcriptRecorder.turnCount;
      if (turns >= 6 && turns % 6 === 0) {
        const snapshot = this.transcriptRecorder.snapshot();
        const profile = this.profile;
        runBackgroundAnalysis(snapshot, profile).catch((e) =>
          console.warn(
            `[${profile.label}] Incremental background analysis failed:`,
            e
          )
        );
      }
    }

    return fullResponse || "No response from Claude.";
  }

  /**
   * Force background memory analysis now, regardless of turn count.
   * Called before /new so memory is saved even for short sessions.
   */
  async forceMemoryFlush(): Promise<void> {
    if (!this.transcriptRecorder) return;
    const transcript = this.transcriptRecorder.snapshot();
    if (transcript.turns.length < 2) return;
    runBackgroundAnalysis(transcript, this.profile).catch((e) =>
      console.warn(`[${this.profile.label}] forceMemoryFlush failed:`, e)
    );
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
      console.log(
        `[${this.profile.label}] Session saved to ${this.profile.sessionFile}`
      );
    } catch (error) {
      console.warn(
        `[${this.profile.label}] Failed to save session: ${error}`
      );
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
      `[${this.profile.label}] Resumed session ${sessionData.session_id.slice(
        0,
        8
      )}... - "${sessionData.title}"`
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
    return heuristic.changed;
  }
}

// ============== Background memory analysis ==============

async function runBackgroundAnalysis(
  transcript: import("./memory/types").SessionTranscript,
  profile: UserProfile
): Promise<void> {
  if (transcript.turns.length < 2) return;

  const store = new GraphStore(profile.memoryRoot, profile.userId);
  const graph = store.load();

  // Same source rule as the main session — DeepSeek when env is injected,
  // Anthropic otherwise (currently always DeepSeek in production).
  const analyzerSource: UsageSource = profile.deepseekEnv
    ? "bot-deepseek"
    : "bot-anthropic";
  const analyzerModel = profile.lightModel ?? "claude-haiku-4-5";

  const result = await analyzeSession(transcript, graph, {
    model: analyzerModel,
    cwd: profile.workingDir,
    env: profile.deepseekEnv,
    userId: profile.userId,
    source: analyzerSource,
  });

  store.applyAnalysisPatch(graph, result.patch, transcript.session_id);
  store.save(graph);

  // Write session summary markdown
  const outFile = summaryFile(profile.memoryRoot, new Date(), profile.userId);
  fs.writeFileSync(outFile, result.summary_md, "utf8");

  // Rebuild topics index so Claude can find sessions by topic
  rebuildTopicsIndex(profile.memoryRoot, profile.userId);

  console.log(
    `[${profile.label}] Memory analysis complete — ` +
      `${result.patch.upsert_nodes.length} nodes, summary saved to ${outFile}`
  );
}

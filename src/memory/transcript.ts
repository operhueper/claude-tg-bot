import * as fs from "fs";
import type { TranscriptTurn, SessionTranscript } from "./types";
import { transcriptFile, ensureMemoryStructure } from "./paths";

export class TranscriptRecorder {
  private turns: TranscriptTurn[] = [];
  private pendingFlush: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private workingDir: string,
    private sessionId: string,
    private userId: number,
    private startedAt: string = new Date().toISOString()
  ) {
    ensureMemoryStructure(workingDir, userId);
  }

  appendUser(content: string): void {
    this.turns.push({
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    });
    this.scheduleFlush();
  }

  appendAssistant(content: string, toolsUsed?: string[]): void {
    this.turns.push({
      role: "assistant",
      content,
      timestamp: new Date().toISOString(),
      tools_used: toolsUsed,
    });
    this.scheduleFlush();
  }

  getRecentTurns(n: number): TranscriptTurn[] {
    return this.turns.slice(-n);
  }

  get turnCount(): number {
    return this.turns.length;
  }

  /** Return a SessionTranscript snapshot without closing the recorder. */
  snapshot(): SessionTranscript {
    return {
      session_id: this.sessionId,
      user_id: this.userId,
      started_at: this.startedAt,
      turns: [...this.turns],
    };
  }

  private scheduleFlush(): void {
    if (this.pendingFlush) return;
    this.pendingFlush = setTimeout(() => {
      this.flush();
      this.pendingFlush = null;
    }, 5000);
  }

  flush(): void {
    if (this.pendingFlush) {
      clearTimeout(this.pendingFlush);
      this.pendingFlush = null;
    }
    const file = transcriptFile(this.workingDir, this.sessionId, this.userId);
    const lines = this.turns.map(t => JSON.stringify(t)).join("\n");
    fs.writeFileSync(file, lines, "utf8");
  }

  close(): SessionTranscript {
    this.flush();
    return {
      session_id: this.sessionId,
      user_id: this.userId,
      started_at: this.startedAt,
      turns: this.turns,
    };
  }

  static load(workingDir: string, sessionId: string, userId?: number): SessionTranscript | null {
    const file = transcriptFile(workingDir, sessionId, userId);
    if (!fs.existsSync(file)) return null;
    try {
      const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
      const turns = lines.map(l => JSON.parse(l) as TranscriptTurn);
      return { session_id: sessionId, user_id: userId ?? 0, started_at: turns[0]?.timestamp ?? new Date().toISOString(), turns };
    } catch {
      return null;
    }
  }
}

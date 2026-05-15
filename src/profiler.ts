/**
 * Request-level performance profiler.
 *
 * Enabled only when PROFILER_ENABLED=true is set in the environment.
 * All methods are no-ops otherwise — zero overhead in production.
 *
 * Usage:
 *   const p = new RequestProfiler(userId, 'text');
 *   p.mark('auth_ok');
 *   // ... rest of pipeline ...
 *   p.finish();  // writes /tmp/perf-trace-<userId>-<startMs>.json
 */

import { writeFileSync } from "fs";

export const PROFILER_ENABLED = process.env.PROFILER_ENABLED === "true";

interface Mark {
  /** Milliseconds elapsed since profiler construction */
  t: number;
  label: string;
}

interface TraceFile {
  userId: number;
  kind: string;
  startMs: number;
  marks: Mark[];
  totalMs: number;
}

export class RequestProfiler {
  private readonly userId: number;
  private readonly kind: string;
  private readonly startMs: number;
  private readonly marks: Mark[] = [];

  constructor(userId: number, requestKind: string) {
    this.userId = userId;
    this.kind = requestKind;
    this.startMs = Date.now();
  }

  mark(label: string): void {
    if (!PROFILER_ENABLED) return;
    this.marks.push({ t: Date.now() - this.startMs, label });
  }

  finish(): void {
    if (!PROFILER_ENABLED) return;
    const totalMs = Date.now() - this.startMs;
    const trace: TraceFile = {
      userId: this.userId,
      kind: this.kind,
      startMs: this.startMs,
      marks: this.marks,
      totalMs,
    };
    const filename = `/tmp/perf-trace-${this.userId}-${this.startMs}.json`;
    try {
      writeFileSync(filename, JSON.stringify(trace, null, 2));
    } catch (err) {
      console.warn(`[profiler] Failed to write ${filename}: ${(err as Error).message}`);
    }
    // Auto-cleanup registry entry
    _activeProfilers.delete(this.userId);
  }
}

/** Shared no-op profiler instance for paths where profiler is not set up */
export class NoopProfiler {
  mark(_label: string): void {}
  finish(): void {}
}

/**
 * Per-user active profiler registry.
 * text.ts registers a profiler at the start of each request; session.ts reads it.
 * Automatically cleaned up by RequestProfiler.finish().
 */
const _activeProfilers = new Map<number, RequestProfiler>();

export function setActiveProfiler(userId: number, p: RequestProfiler): void {
  _activeProfilers.set(userId, p);
}

export function getActiveProfiler(userId: number): RequestProfiler | undefined {
  return _activeProfilers.get(userId);
}

export function clearActiveProfiler(userId: number): void {
  _activeProfilers.delete(userId);
}

/**
 * Configuration for Claude Telegram Bot.
 *
 * All environment variables, paths, constants, and safety settings.
 * Supports per-user profiles (owner + restricted guests like "Ксения").
 */

import { homedir } from "os";
import { resolve, dirname } from "path";
import { mkdirSync, existsSync, writeFileSync } from "fs";
import type { McpServerConfig } from "./types";

// ============== Environment Setup ==============

const HOME = homedir();

// Ensure necessary paths are available for Claude's bash commands
// LaunchAgents don't inherit the full shell environment
const EXTRA_PATHS = [
  `${HOME}/.local/bin`,
  `${HOME}/.bun/bin`,
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
];

const currentPath = process.env.PATH || "";
const pathParts = currentPath.split(":");
for (const extraPath of EXTRA_PATHS) {
  if (!pathParts.includes(extraPath)) {
    pathParts.unshift(extraPath);
  }
}
process.env.PATH = pathParts.join(":");

// ============== Core Configuration ==============

export const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

function parseUserList(raw: string): number[] {
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => parseInt(x, 10))
    .filter((x) => !isNaN(x));
}

export const ALLOWED_USERS: number[] = parseUserList(
  process.env.TELEGRAM_ALLOWED_USERS || ""
);

// Restricted (guest) users: subset of ALLOWED_USERS who get the Ksenia profile.
// Defaults to 893951298 if unset, since that's the canonical guest in this deployment.
const guestEnv = process.env.TELEGRAM_GUEST_USERS;
export const GUEST_USERS: number[] =
  guestEnv !== undefined ? parseUserList(guestEnv) : [893951298];

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// ============== Claude CLI Path ==============

function findClaudeCli(): string {
  const envPath = process.env.CLAUDE_CLI_PATH;
  if (envPath) return envPath;

  const whichResult = Bun.which("claude");
  if (whichResult) return whichResult;

  return "/usr/local/bin/claude";
}

export const CLAUDE_CLI_PATH = findClaudeCli();

// ============== MCP Configuration ==============

let MCP_SERVERS: Record<string, McpServerConfig> = {};

try {
  const mcpConfigPath = resolve(dirname(import.meta.dir), "mcp-config.ts");
  const mcpModule = await import(mcpConfigPath).catch(() => null);
  if (mcpModule?.MCP_SERVERS) {
    MCP_SERVERS = mcpModule.MCP_SERVERS;
    console.log(
      `Loaded ${Object.keys(MCP_SERVERS).length} MCP servers from mcp-config.ts`
    );
  }
} catch {
  console.log("No mcp-config.ts found - running without MCPs");
}

export { MCP_SERVERS };

// ============== Owner Working Directory & Paths ==============

const OWNER_WORKING_DIR = process.env.CLAUDE_WORKING_DIR || HOME;

const KSENIA_DIR = process.env.GUEST_WORKING_DIR || `${HOME}/Ксения`;

// Bootstrap guest directory + starter CLAUDE.md so her sessions land in a real place.
// Also seeds .claude/settings.json so her project-scoped settingSources have an
// allow-list for MCP tools (pollinations-image, send-file, ask-user) and the
// standard toolset. Without this, MCP calls silently fail because the owner's
// ~/.claude/settings.json is intentionally not loaded for guests.
function bootstrapGuestDir(): void {
  try {
    if (!existsSync(KSENIA_DIR)) {
      mkdirSync(KSENIA_DIR, { recursive: true });
      console.log(`Created guest dir: ${KSENIA_DIR}`);
    }
    const guestClaudeMd = `${KSENIA_DIR}/CLAUDE.md`;
    if (!existsSync(guestClaudeMd)) {
      writeFileSync(
        guestClaudeMd,
        `# Ксения

Это твой персональный рабочий каталог. Здесь живут твои файлы, заметки, проекты и память.

- Ассистент работает в этой папке и её подпапках.
- Доступ к системным файлам бота и чужим директориям закрыт.
- Файлы можно отправлять и получать через Telegram.
`
      );
      console.log(`Created ${guestClaudeMd}`);
    }

    const guestClaudeDir = `${KSENIA_DIR}/.claude`;
    const guestSettings = `${guestClaudeDir}/settings.json`;
    if (!existsSync(guestSettings)) {
      mkdirSync(guestClaudeDir, { recursive: true });
      writeFileSync(
        guestSettings,
        JSON.stringify(
          {
            permissions: {
              defaultMode: "acceptEdits",
              allow: [
                "Bash",
                "Write",
                "Edit",
                "MultiEdit",
                "Read",
                "Glob",
                "Grep",
                "WebSearch",
                "WebFetch",
                "NotebookEdit",
                "TodoWrite",
                "Task",
                "mcp__ask-user",
                "mcp__send-file",
                "mcp__pollinations-image",
              ],
            },
          },
          null,
          2
        ) + "\n"
      );
      console.log(`Created ${guestSettings}`);
    }
  } catch (error) {
    console.warn(`Failed to bootstrap guest dir: ${error}`);
  }
}

bootstrapGuestDir();

// Owner default allowed paths (current behavior + guest dir for cross-access)
const ownerDefaultAllowedPaths = [
  OWNER_WORKING_DIR,
  `${HOME}/Documents`,
  `${HOME}/Downloads`,
  `${HOME}/Desktop`,
  `${HOME}/.claude`,
  KSENIA_DIR, // owner can read guest files
];

const ownerAllowedPathsStr = process.env.ALLOWED_PATHS || "";
const OWNER_ALLOWED_PATHS: string[] = ownerAllowedPathsStr
  ? ownerAllowedPathsStr
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
  : ownerDefaultAllowedPaths;

// Guest paths: ONLY her dir. Bot repo, ~/.claude, owner files all blocked.
const GUEST_ALLOWED_PATHS: string[] = [KSENIA_DIR];

// ============== System Prompts ==============

function buildOwnerSafetyPrompt(allowedPaths: string[]): string {
  const pathsList = allowedPaths
    .map((p) => `   - ${p} (and subdirectories)`)
    .join("\n");

  return `
CRITICAL SAFETY RULES FOR TELEGRAM BOT:

1. NEVER delete, remove, or overwrite files without EXPLICIT confirmation from the user.
   - If user asks to delete something, respond: "Are you sure you want to delete [file]? Reply 'yes delete it' to confirm."
   - Only proceed with deletion if user replies with explicit confirmation like "yes delete it", "confirm delete"
   - This applies to: rm, trash, unlink, shred, or any file deletion

2. You can ONLY access files in these directories:
${pathsList}
   - REFUSE any file operations outside these paths

3. NEVER run dangerous commands like:
   - rm -rf (recursive force delete)
   - Any command that affects files outside allowed directories
   - Commands that could damage the system

4. For any destructive or irreversible action, ALWAYS ask for confirmation first.

You are running via Telegram, so the user cannot easily undo mistakes. Be extra careful!
`;
}

function buildGuestSafetyPrompt(workingDir: string): string {
  return `
ROLE: Ты персональный ассистент для пользователя Ксения. Общайся на её языке (по умолчанию русский).

ИЗОЛЯЦИЯ И ЗАПРЕТЫ:

1. Твоя рабочая директория: ${workingDir}
   - Все файлы, заметки, проекты — только здесь и в подпапках.
   - Ты НЕ имеешь доступа к остальной файловой системе. Любые попытки прочитать/записать вне этой папки заблокированы и должны быть отклонены.

2. ЗАПРЕЩЕНО помогать с:
   - модификацией этого Telegram-бота, его исходного кода, конфигурации, env-переменных, MCP, плагинов, скиллов или launch-агентов
   - установкой/обновлением системных пакетов, brew, npm/bun, изменением PATH
   - доступом к чужим файлам, репозиториям, ~/.claude, /Users/* кроме твоей папки
   - выполнением команд, влияющих на других пользователей бота или их сессии
   - перезапуском бота, изменением его поведения, добавлением команд

   Если просят что-то из этого — вежливо откажи и объясни, что эти действия недоступны для пользовательского аккаунта. Перенаправь на владельца бота.

3. УДАЛЕНИЕ ФАЙЛОВ:
   - Никогда не удаляй файлы без явного подтверждения ("да, удали").
   - rm -rf, sudo, форматирование диска и подобное — категорически запрещено.

4. ОБЫЧНЫЕ ЗАДАЧИ (разрешено):
   - Помощь с письмом, переводами, объяснениями, кодом, документами
   - Работа с файлами в её папке: чтение, создание, редактирование
   - Анализ присланных через Telegram документов, фото, голоса, видео
   - Любые субагенты — Sonnet по умолчанию, Opus для сложного reasoning, Haiku для быстрого чтения

Ты помощник, не админ. Будь дружелюбной, краткой, полезной.
`;
}

// ============== User Profile ==============

export interface UserProfile {
  userId: number;
  isOwner: boolean;
  isGuest: boolean;
  workingDir: string;
  allowedPaths: string[];
  settingSources: Array<"user" | "project" | "local">;
  systemPrompt: string;
  rateLimitEnabled: boolean;
  rateLimitRequests: number;
  rateLimitWindow: number;
  model: string;
  sessionFile: string;
  /** Telegram commands this user is allowed to invoke */
  allowedCommands: Set<string>;
  label: string;
}

const RATE_LIMIT_REQUESTS_DEFAULT = parseInt(
  process.env.RATE_LIMIT_REQUESTS || "20",
  10
);
const RATE_LIMIT_WINDOW_DEFAULT = parseInt(
  process.env.RATE_LIMIT_WINDOW || "60",
  10
);
const RATE_LIMIT_ENABLED_DEFAULT =
  (process.env.RATE_LIMIT_ENABLED || "true").toLowerCase() === "true";

const OWNER_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const GUEST_MODEL = process.env.GUEST_CLAUDE_MODEL || "claude-sonnet-4-6";

const OWNER_COMMANDS = new Set([
  "start",
  "new",
  "stop",
  "status",
  "resume",
  "retry",
  "restart",
]);
// Guest cannot /restart (would interrupt owner's work and the bot service)
const GUEST_COMMANDS = new Set(["start", "new", "stop", "status", "resume", "retry"]);

const OWNER_SAFETY_PROMPT = buildOwnerSafetyPrompt(OWNER_ALLOWED_PATHS);

export function isGuest(userId: number): boolean {
  return GUEST_USERS.includes(userId);
}

export function getUserProfile(userId: number): UserProfile {
  const guest = isGuest(userId);
  if (guest) {
    return {
      userId,
      isOwner: false,
      isGuest: true,
      workingDir: KSENIA_DIR,
      allowedPaths: GUEST_ALLOWED_PATHS,
      settingSources: ["project"], // do NOT load owner's ~/.claude
      systemPrompt: buildGuestSafetyPrompt(KSENIA_DIR),
      rateLimitEnabled: false, // no limits for guest, per spec
      rateLimitRequests: RATE_LIMIT_REQUESTS_DEFAULT,
      rateLimitWindow: RATE_LIMIT_WINDOW_DEFAULT,
      model: GUEST_MODEL,
      sessionFile: `/tmp/claude-telegram-session-${userId}.json`,
      allowedCommands: GUEST_COMMANDS,
      label: "Ксения",
    };
  }
  return {
    userId,
    isOwner: true,
    isGuest: false,
    workingDir: OWNER_WORKING_DIR,
    allowedPaths: OWNER_ALLOWED_PATHS,
    settingSources: ["user", "project"],
    systemPrompt: OWNER_SAFETY_PROMPT,
    rateLimitEnabled: RATE_LIMIT_ENABLED_DEFAULT,
    rateLimitRequests: RATE_LIMIT_REQUESTS_DEFAULT,
    rateLimitWindow: RATE_LIMIT_WINDOW_DEFAULT,
    model: OWNER_MODEL,
    sessionFile: `/tmp/claude-telegram-session-${userId}.json`,
    allowedCommands: OWNER_COMMANDS,
    label: "owner",
  };
}

// ============== Backwards-compatible exports ==============
// These are still exported for code paths that haven't yet migrated to profiles,
// but new code should use getUserProfile(userId).

export const WORKING_DIR = OWNER_WORKING_DIR;
export const ALLOWED_PATHS = OWNER_ALLOWED_PATHS;
export const SAFETY_PROMPT = OWNER_SAFETY_PROMPT;

// ============== Dangerous Command Patterns ==============

export const BLOCKED_PATTERNS = [
  "rm -rf /",
  "rm -rf ~",
  "rm -rf $HOME",
  "sudo rm",
  ":(){ :|:& };:", // Fork bomb
  "> /dev/sd",
  "mkfs.",
  "dd if=",
];

// Query timeout (3 minutes)
export const QUERY_TIMEOUT_MS = 180_000;

// ============== Voice Transcription ==============

const BASE_TRANSCRIPTION_PROMPT = `Transcribe this voice message accurately.
The speaker may use multiple languages (English, and possibly others).
Focus on accuracy for proper nouns, technical terms, and commands.`;

let TRANSCRIPTION_CONTEXT = "";
if (process.env.TRANSCRIPTION_CONTEXT_FILE) {
  try {
    const file = Bun.file(process.env.TRANSCRIPTION_CONTEXT_FILE);
    if (await file.exists()) {
      TRANSCRIPTION_CONTEXT = (await file.text()).trim();
    }
  } catch {
    // File not found or unreadable — proceed without context
  }
}

export const TRANSCRIPTION_PROMPT = TRANSCRIPTION_CONTEXT
  ? `${BASE_TRANSCRIPTION_PROMPT}\n\nAdditional context:\n${TRANSCRIPTION_CONTEXT}`
  : BASE_TRANSCRIPTION_PROMPT;

export const TRANSCRIPTION_AVAILABLE = !!OPENAI_API_KEY;

// ============== Thinking Keywords ==============

const thinkingKeywordsStr =
  process.env.THINKING_KEYWORDS || "think,pensa,ragiona";
const thinkingDeepKeywordsStr =
  process.env.THINKING_DEEP_KEYWORDS || "ultrathink,think hard,pensa bene";

export const THINKING_KEYWORDS = thinkingKeywordsStr
  .split(",")
  .map((k) => k.trim().toLowerCase());
export const THINKING_DEEP_KEYWORDS = thinkingDeepKeywordsStr
  .split(",")
  .map((k) => k.trim().toLowerCase());

// ============== Media Group Settings ==============

export const MEDIA_GROUP_TIMEOUT = 1000;

// ============== Telegram Message Limits ==============

export const TELEGRAM_MESSAGE_LIMIT = 4096;
export const TELEGRAM_SAFE_LIMIT = 4000;
export const STREAMING_THROTTLE_MS = 500;
export const BUTTON_LABEL_MAX_LENGTH = 30;

// ============== Audit Logging ==============

export const AUDIT_LOG_PATH =
  process.env.AUDIT_LOG_PATH || "/tmp/claude-telegram-audit.log";
export const AUDIT_LOG_JSON =
  (process.env.AUDIT_LOG_JSON || "false").toLowerCase() === "true";

// ============== UI Verbosity ==============
export const SHOW_TOOL_USE =
  (process.env.SHOW_TOOL_USE || "false").toLowerCase() === "true";
export const SHOW_THINKING =
  (process.env.SHOW_THINKING || "false").toLowerCase() === "true";

// ============== Rate Limiting (legacy globals - kept for backwards compat) ==============

export const RATE_LIMIT_ENABLED = RATE_LIMIT_ENABLED_DEFAULT;
export const RATE_LIMIT_REQUESTS = RATE_LIMIT_REQUESTS_DEFAULT;
export const RATE_LIMIT_WINDOW = RATE_LIMIT_WINDOW_DEFAULT;

// ============== File Paths ==============

// Legacy single-session file kept for migration; new code uses profile.sessionFile.
export const SESSION_FILE = "/tmp/claude-telegram-session.json";
export const RESTART_FILE = "/tmp/claude-telegram-restart.json";
export const TEMP_DIR = "/tmp/telegram-bot";

export const TEMP_PATHS = ["/tmp/", "/private/tmp/", "/var/folders/"];

await Bun.write(`${TEMP_DIR}/.keep`, "");

// ============== Validation ==============

if (!TELEGRAM_TOKEN) {
  console.error("ERROR: TELEGRAM_BOT_TOKEN environment variable is required");
  process.exit(1);
}

if (ALLOWED_USERS.length === 0) {
  console.error(
    "ERROR: TELEGRAM_ALLOWED_USERS environment variable is required"
  );
  process.exit(1);
}

console.log(
  `Config loaded: ${ALLOWED_USERS.length} allowed users (${GUEST_USERS.length} guest), owner dir: ${OWNER_WORKING_DIR}, guest dir: ${KSENIA_DIR}`
);

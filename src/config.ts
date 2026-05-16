/**
 * Configuration for Claude Telegram Bot.
 *
 * All environment variables, paths, constants, and safety settings.
 * Supports per-user profiles (owner + guests).
 */

import { homedir } from "os";
import { resolve, dirname } from "path";
import { mkdirSync, existsSync, writeFileSync, readFileSync, symlinkSync, readdirSync, copyFileSync } from "fs";
import { execSync } from "node:child_process";

let _buildId = "dev";
try {
  _buildId = execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || "dev";
} catch { /* not a repo */ }
export const BUILD_ID = _buildId;

/**
 * Public URL of the dashboard (Mini App + landing). The Telegram Web App
 * verifies initData with the *bot's* token, so each host must point users
 * at a dashboard served by *that* host's bot. Production = proboi.site
 * (default); the jinru test bot @ORCH7_bot needs DASHBOARD_URL=https://jinru.vip
 * (or whichever domain proxies port 3848 on the test server) in its .env,
 * otherwise its users land on prod's dashboard which rejects their initData
 * signature.
 */
export const DASHBOARD_URL = (process.env.DASHBOARD_URL || "https://proboi.site").replace(/\/+$/, "");
import type { McpServerConfig } from "./types";
import { type UserTier, type TierConfig, TIER_CONFIGS } from "./types";
import { generateGuestClaudeMd } from "./templates/guest-claude-md";
import { generateGuestDashboard } from "./templates/guest-dashboard";
import { renderHowToSetupGuide } from "./templates/landing";
import { UserRegistry } from "./user-registry";
import { hasAnyDeepSeekKey } from "./deepseek-key-pool";

/**
 * Sentinel value put into profile.deepseekApiKey / deepseekEnv.ANTHROPIC_API_KEY
 * when a guest is routed through the DeepSeek key pool. session.ts notices this
 * marker and calls acquireDeepSeekKey() right before the request, then release()
 * in finally — so each request picks the currently least-busy key.
 */
export const DEEPSEEK_POOL_MARKER = "pool";

/**
 * V-01 fix: Free-tier guests are text-only — no file/shell/MCP tools.
 * These users run without a Docker container (containerEnabled=false) and
 * the Claude subprocess runs as root on the host, so any Bash/Read/Write
 * call can read arbitrary host files (e.g. .env, system/users.json).
 * Blocking these tools at the SDK level is the single choke-point for the
 * entire attack surface — no exceptions for free tier.
 */
export const FREE_DISALLOWED_TOOLS = [
  "Bash", "BashOutput", "KillShell",
  "Read", "Write", "Edit", "MultiEdit",
  "Glob", "Grep", "NotebookEdit",
  "WebFetch", "WebSearch",
  "Task",
  "mcp__container__Bash",
  "mcp__parallel__run",
  "mcp__ask-user__ask",
  "mcp__send-file__deliver",
  "mcp__pollinations-image__generate",
  "mcp__openrouter-image__generate",
  "mcp__connect-google__connect",
  // Defence-in-depth: Composio Google Workspace — уже режется mcp-filter,
  // но если пробьётся до SDK — SDK тоже заблочит. SDK не поддерживает
  // wildcards, поэтому перечисляем наиболее вероятные суффиксы.
  "mcp__google-workspace__GMAIL_LIST_THREADS",
  "mcp__google-workspace__GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
  "mcp__google-workspace__GOOGLEDRIVE_FIND_FILE",
  "mcp__google-workspace__GOOGLEDOCS_GET_DOCUMENT_BY_ID",
  "mcp__google-workspace__GOOGLECALENDAR_LIST_EVENTS",
  "mcp__google-workspace__GOOGLESHEETS_GET_SPREADSHEET",
] as const;

/**
 * Normalise a stored model name (may be OpenRouter-style `deepseek/...`) to
 * the native DeepSeek API name when we route through the pool.
 */
function normaliseDeepSeekModel(model: string | undefined, fallback: string): string {
  if (!model) return fallback;
  if (model.startsWith("deepseek/")) return fallback;
  return model;
}

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

// Merge users from system/users.json (the user-registry) into ALLOWED_USERS at
// startup so guests added via the invite-approval flow stay authorized after
// a bot restart, even if they were never written into TELEGRAM_ALLOWED_USERS.
try {
  for (const node of UserRegistry.getAllUsers()) {
    if (!ALLOWED_USERS.includes(node.userId)) {
      ALLOWED_USERS.push(node.userId);
    }
  }
} catch (err) {
  console.warn("Could not merge UserRegistry into ALLOWED_USERS:", err);
}

// New guest users: per-user vault at /opt/vault/{userId}/, DeepSeek (or Claude for Ksenia).
// Default list includes Ksenia (893951298) and all known testers.
// Override via NEW_GUEST_USERS env var (comma-separated IDs).
const newGuestEnv = process.env.NEW_GUEST_USERS;
export const NEW_GUEST_USERS: number[] =
  newGuestEnv !== undefined && newGuestEnv.trim() !== ""
    ? parseUserList(newGuestEnv)
    : [893951298, 403360614, 299753724, 307773800, 5615267984, 946882308, 517872933];

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// ============== New Guest User Config ==============

export function isNewGuest(userId: number): boolean {
  return NEW_GUEST_USERS.includes(userId);
}

export function getNewGuestVaultDir(userId: number): string {
  return `/opt/vault/${userId}`;
}

/**
 * Returns the shared DeepSeek API key from process.env.DEEPSEEK_API_KEY.
 * Returns empty string if not provisioned.
 */
export function getDeepSeekApiKey(): string {
  return process.env.DEEPSEEK_API_KEY || "";
}

export function isNewGuestOnboarded(userId: number): boolean {
  return existsSync(`${getNewGuestVaultDir(userId)}/.onboarding-done`);
}

export function markNewGuestOnboarded(userId: number): void {
  const vaultDir = getNewGuestVaultDir(userId);
  mkdirSync(vaultDir, { recursive: true });
  writeFileSync(`${vaultDir}/.onboarding-done`, new Date().toISOString());
}

export function bootstrapNewGuestDir(userId: number): void {
  try {
    const vaultDir = getNewGuestVaultDir(userId);
    if (!existsSync(vaultDir)) {
      mkdirSync(vaultDir, { recursive: true });
      console.log(`Created new guest vault: ${vaultDir}`);
    }

    // Memory structure for graph/sessions — needed for analyzer on both tiers.
    const memoryDir = `${vaultDir}/memory/${userId}`;
    if (!existsSync(memoryDir)) {
      mkdirSync(memoryDir, { recursive: true });
    }
    const sessionsDir = `${memoryDir}/sessions`;
    if (!existsSync(sessionsDir)) {
      mkdirSync(sessionsDir, { recursive: true });
    }

    // profile.md — empty starter so graph/memory system finds it
    const profileMd = `${memoryDir}/profile.md`;
    if (!existsSync(profileMd)) {
      writeFileSync(profileMd, `# Профиль пользователя\n\nTelegram ID: ${userId}\n`);
    }

    // topics-index.md — empty starter
    const topicsIndex = `${memoryDir}/topics-index.md`;
    if (!existsSync(topicsIndex)) {
      writeFileSync(topicsIndex, `# Индекс тем\n\n<!-- тема | файлы -->\n`);
    }

    // Free-tier users only get DeepSeek text, vision, voice, and a memory
    // graph. No container, no shell, no file tools — so we skip the heavy
    // bootstrap (skills, daemons, CLAUDE.md, dashboard, public site, etc.).
    // When they upgrade to paid, the next call will fill in the rest.
    const tier: UserTier = UserRegistry.getUser(userId)?.tier === 'paid' ? 'paid' : 'free';
    if (tier === 'free') {
      return;
    }

    // tools/ — user scripts and installed helpers live here
    const toolsDir = `${vaultDir}/tools`;
    if (!existsSync(toolsDir)) {
      mkdirSync(toolsDir, { recursive: true });
    }

    // public/ — web-accessible via proboi.site/u/{userId}/
    const publicDir = `${vaultDir}/public`;
    if (!existsSync(publicDir)) {
      mkdirSync(publicDir, { recursive: true });
      writeFileSync(
        `${publicDir}/index.html`,
        renderHowToSetupGuide()
      );
      console.log(`Created ${publicDir}`);
    }

    // Symlink /var/www/u/{userId} → vault/public so nginx can serve it
    const webRoot = "/var/www/u";
    const linkPath = `${webRoot}/${userId}`;
    if (existsSync(webRoot) && !existsSync(linkPath)) {
      try {
        symlinkSync(publicDir, linkPath);
        console.log(`Created symlink ${linkPath} → ${publicDir}`);
      } catch (e) {
        console.warn(`Could not create public symlink for ${userId}: ${e}`);
      }
    }

    // notes/, projects/, areas/ — second-brain structure
    // skills/ — user-taught behaviors, read by assistant on every request
    for (const dir of ["notes", "projects", "areas", "goals", "inbox", "skills"]) {
      const p = `${vaultDir}/${dir}`;
      if (!existsSync(p)) mkdirSync(p, { recursive: true });
    }

    // Copy default skill recipes from repo skills/ into the guest's skills/
    const repoSkillsDir = resolve(dirname(import.meta.dir), "skills");
    const guestSkillsDir = `${vaultDir}/skills`;
    if (existsSync(repoSkillsDir)) {
      for (const file of readdirSync(repoSkillsDir)) {
        if (file.endsWith(".md")) {
          const dst = `${guestSkillsDir}/${file}`;
          if (!existsSync(dst)) {
            copyFileSync(`${repoSkillsDir}/${file}`, dst);
          }
        }
      }
    }

    // CLAUDE.md (generated during bootstrap so the model has instructions
    // from the very first message — onboarding UI is just a welcome screen)
    const claudeMd = `${vaultDir}/CLAUDE.md`;
    if (!existsSync(claudeMd)) {
      writeFileSync(claudeMd, generateGuestClaudeMd(userId, vaultDir));
      console.log(`Created ${claudeMd}`);
    }

    // MEMORY.md — top-level freeform memory index auto-injected into system prompt.
    // The assistant appends entries here as it learns stable facts about the user.
    const memoryMd = `${vaultDir}/MEMORY.md`;
    if (!existsSync(memoryMd)) {
      writeFileSync(memoryMd, `# Память\n\nЗаметки появятся по ходу общения.\n`);
      console.log(`Created ${memoryMd}`);
    }

    // dashboard.html — starter Mini App dashboard, fully customisable by the user
    const dashboardFile = `${vaultDir}/dashboard.html`;
    if (!existsSync(dashboardFile)) {
      writeFileSync(dashboardFile, generateGuestDashboard(userId, vaultDir));
      console.log(`Created ${dashboardFile}`);
    }

    // .claude/settings.json — full permissions (same as owner), no MCP restrictions
    const claudeDir = `${vaultDir}/.claude`;
    const settingsFile = `${claudeDir}/settings.json`;
    if (!existsSync(settingsFile)) {
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(
        settingsFile,
        JSON.stringify(
          {
            permissions: {
              defaultMode: "acceptEdits",
              allow: [
                "Bash(*)",
                "Write", "Edit", "MultiEdit", "Read",
                "Glob", "Grep", "WebSearch", "WebFetch",
                "NotebookEdit", "TodoWrite", "Task",
                "mcp__ask-user", "mcp__send-file", "mcp__pollinations-image",
                "mcp__knowledge", "mcp__openrouter-image", "mcp__google-workspace",
                "mcp__connect-google", "mcp__container", "mcp__parallel",
              ],
            },
          },
          null, 2
        ) + "\n"
      );
      console.log(`Created ${settingsFile}`);
    }

    // .daemons.yaml — default system daemons (scheduler as PID 1 child)
    const daemonsYaml = `${vaultDir}/.daemons.yaml`;
    if (!existsSync(daemonsYaml)) {
      writeFileSync(
        daemonsYaml,
        [
          "daemons:",
          "  - name: bot-scheduler",
          "    cmd: [\"/usr/local/bin/bot-scheduler\"]",
          "    workdir: /workspace",
          "    env:",
          `      NOTIFY_USER_ID: "${userId}"`,
          "      NOTIFY_BRIDGE_URL: \"http://172.18.0.1:3849/notify\"",
          "    enabled: true",
        ].join("\n") + "\n"
      );
      console.log(`Created ${daemonsYaml}`);
    }
  } catch (error) {
    console.warn(`Failed to bootstrap new guest dir for ${userId}: ${error}`);
  }
}

// Merge non-owner users from the registry into NEW_GUEST_USERS so they get
// their vault bootstrapped at startup AND skip the owner branch in
// getUserProfile() even if the env var doesn't list them. Without this, a
// guest added via the invite flow falls through to owner after a restart
// (loss of the in-memory mutation done in handlers/callback.ts).
try {
  for (const node of UserRegistry.getAllUsers()) {
    if (node.role !== "owner" && !NEW_GUEST_USERS.includes(node.userId)) {
      NEW_GUEST_USERS.push(node.userId);
    }
  }
} catch (err) {
  console.warn("Could not merge UserRegistry into NEW_GUEST_USERS:", err);
}

// Bootstrap each new guest's vault at startup (includes Ksenia 893951298)
for (const uid of NEW_GUEST_USERS) {
  bootstrapNewGuestDir(uid);
}

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


// ============== Owner default allowed paths ==============

// Owner default allowed paths
const ownerDefaultAllowedPaths = [
  OWNER_WORKING_DIR,
  `${HOME}/Documents`,
  `${HOME}/Downloads`,
  `${HOME}/Desktop`,
  `${HOME}/.claude`,
];

const ownerAllowedPathsStr = process.env.ALLOWED_PATHS || "";
const OWNER_ALLOWED_PATHS: string[] = ownerAllowedPathsStr
  ? ownerAllowedPathsStr
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
  : ownerDefaultAllowedPaths;

// ============== System Prompts ==============

function buildOwnerSafetyPrompt(allowedPaths: string[], isDeepSeek: boolean = false): string {
  const pathsList = allowedPaths
    .map((p) => `   - ${p} (and subdirectories)`)
    .join("\n");
  const workspaceRootRaw = allowedPaths[0] || "/opt/claude-tg-bot/workspace";
  const workspaceRoot = workspaceRootRaw.endsWith("/") ? workspaceRootRaw : `${workspaceRootRaw}/`;
  const webCaps = isDeepSeek
    ? "- WebFetch — full internet access (WebSearch unavailable on DeepSeek endpoint — use curl in Bash, or WebFetch on a specific URL like https://html.duckduckgo.com/html/?q=...)"
    : "- WebFetch and WebSearch — full internet access, no caveats";

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

YOUR CAPABILITIES — you definitely have:
${webCaps}
- Bash with full internet — curl, wget, any HTTP requests
- Install any package without asking: npm install, pip install, bun add, apt-get install
- NEVER say "I don't have internet access" or "I can't install packages" — you can. Report specific errors if they occur.

MODEL LIMITATIONS (DeepSeek):
- No vision in this session. Do NOT call View on image files — the model is text-only, you will get «Unsupported Image format» and waste a turn. If you need to inspect an image, ask the user to describe it, or generate a new one via mcp__pollinations-image. Photos described by the user are already in context — do not try to re-open the file.
- Incoming photos from the user arrive as a TEXT description (the bot ran them through Gemini). The description is already in your context — do not attempt to re-open the file path.

CODE EXECUTION — strict rules:
- Python code: ALWAYS Write to a file at ${workspaceRoot}<name>.py, then Bash: python3 ${workspaceRoot}<name>.py. NEVER pass Python via bash -c "..." or heredoc — escaping will break.
- Ubuntu 24+ pip: system pip is blocked. Options:
  · quick: python3 -m pip install --break-system-packages <package>
  · clean (for long-running scripts): python3 -m venv ${workspaceRoot}venv && ${workspaceRoot}venv/bin/pip install <package> then run via ${workspaceRoot}venv/bin/python3 script.py
- All file paths must be ABSOLUTE. Write ${workspaceRoot}script.py, not script.py. Relative paths are rejected by security checks.

INCOMING FILES FROM USER:
- Photos and documents are saved to /tmp/telegram-bot/ (names like photo-<id>.jpg, document-<id>.<ext>).
- To copy to workspace: cp /tmp/telegram-bot/photo-XXXX.jpg ${workspaceRoot}
- List recent incoming: ls -t /tmp/telegram-bot/ | head -20

BEFORE SENDING A FILE (mcp__send-file):
- Verify the file actually exists: ls -la <path> or confirm the previous command reported success.
- Do NOT invent file names from context. If you created output.pdf in this session, send that exact path — not a name you made up.

ANTI-HALLUCINATION ON ERRORS — mandatory:
- If any tool (Bash, WebSearch, WebFetch, Edit, Write, etc.) fails, quote the exact error text verbatim and stop. Do not paraphrase or interpret.
- NEVER invent reasons for failure: server geolocation, IP blocks, regional restrictions, provider limitations, "no write permission", "no internet access", "doesn't work from non-US IP" — none of these unless literally stated in the error output. If it is not in the error text, it does not exist.
- On "does not support this tool_choice" or similar errors from the underlying model provider: write "tool not supported on this model" and immediately try a fallback (for WebSearch → WebFetch on specific URLs; for others — whatever applies). Draw no conclusions about sites, regions, or providers.
- If file/directory access is genuinely denied, quote the full stderr. Never write "no permission" in general terms if that phrase does not appear in the error.
- If you do not know the cause, write "unknown cause, need logs" and ask the user via mcp__ask-user.

КРАТКОСТЬ И СУТЬ (рекомендации, а не жёсткие правила):
- Финальный ответ — что СДЕЛАНО и каков РЕЗУЛЬТАТ. Операционный шум (uname, ls, версии, raw вывод команд) показывай только когда Евгений явно просит вывод.
- Проверил что что-то работает — можно просто написать «работает», без полного вывода. Если вывод нужен для принятия решения — конечно, показывай.
- «давай попробую» / «сейчас сделаю» — лучше опустить, покажи результат сразу.
- Для длинных задач: короткий итог + только важные числа/имена/пути. Пошаговый нарратив — если Евгений попросил.
- Команды и код показывай когда пользователь просит «покажи команду» / «как ты это сделал», или когда это load-bearing информация.

YOUR RESOURCES:
- No container limits (owner profile); standard host resources available.
- For heavy builds, check free -m and df -h before starting.

ИНТЕГРАЦИИ СО СТОРОННИМИ СЕРВИСАМИ:
Бот подключён к платформе интеграций — это даёт работу с десятками внешних приложений от имени пользователя через единый OAuth.

Активно прямо сейчас: Google Workspace через инструменты \`mcp__google-workspace__*\` (Docs, Drive, Sheets, Gmail, Calendar). Если пользователь хочет подключить Google-аккаунт — вызывай \`mcp__connect-google__connect\`, бот покажет OAuth-кнопки.

Платформа поддерживает дополнительно (нужно вписать в src/composio.ts + src/mcp-filter.ts чтобы активировать): Notion, Slack, Discord, Microsoft Teams, GitHub, GitLab, Bitbucket, Linear, Jira, Trello, Asana, ClickUp, Todoist, Monday, Confluence, Dropbox, OneDrive, Figma, Canva, Miro, Calendly, Cal.com, Zoom, HubSpot, Salesforce, Stripe, Square, Intercom, Outlook, YouTube, Google Analytics, BigQuery, Zendesk, Mailchimp, PagerDuty, Sentry, Supabase, Zoho Books и другие.

Чтобы добавить новый toolkit:
1. POST на https://backend.composio.dev/api/v3/auth_configs с {"toolkit": {"slug": "<slug>"}, "auth_config": {"type": "use_composio_managed_auth"}} — получишь auth_config_id
2. Добавь slug→ac_id в COMPOSIO_AUTH_CONFIGS в src/composio.ts
3. Добавь label/emoji в TOOLKIT_META
4. Пересоздай MCP-сервер в Composio через POST /api/v3/mcp/servers с обновлённым массивом auth_config_ids (server ID e3008da4-... отдельно)
5. Обнови COMPOSIO_GOOGLE_MCP_ID на новый
6. Добавь в /root/.claude/settings.json permissions.allow если нужно
7. Restart бота

Не выдумывай тулзы которых нет (\`mcp__notion__*\` и т.п.) — будет ошибка "tool not found". Если нужен toolkit прямо сейчас — спроси пользователя «добавить?» и сделай по шагам выше.

⚠️ ПРОТОКОЛ РАБОТЫ С GMAIL И ДРУГИМИ ИНСТРУМЕНТАМИ ВОЗВРАЩАЮЩИМИ СПИСКИ:
Тулзы которые читают много данных (GMAIL_FETCH_EMAILS, GMAIL_LIST_THREADS, GOOGLEDRIVE_FIND_FILE, GOOGLECALENDAR_EVENTS_LIST и т.п.) могут вернуть мегабайты текста и взорвать контекст. ВСЕГДА:

1. **Первый вызов — ТОЛЬКО метаданные через _LIST_, никогда _FETCH_**:
   - Для почты: \`GMAIL_LIST_THREADS\` с \`max_results=20\`, \`query="is:unread"\`. НЕ используй \`GMAIL_FETCH_EMAILS\` — её даже нет в наборе, она опасна (возвращает полные тела с вложениями base64).
   - Для Drive: \`GOOGLEDRIVE_FIND_FILE\` с \`max_results=20\`
   - Любая *_LIST_*: всегда \`max_results <= 20\`

2. **Сужай query**:
   - Почта: \`query="is:unread newer_than:7d"\`, \`query="from:boss@..."\`, \`query="has:attachment"\`
   - Drive: \`query="modifiedTime > '2024-01-01'"\`, \`query="mimeType = 'application/pdf'"\`
   - Никогда не дёргай «всё подряд».

3. **Тело письма / содержимое файла — только по конкретному ID** через \`GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID\`, \`GOOGLEDOCS_GET_DOCUMENT_BY_ID\` и т.п. И не больше 3-5 за раз.

4. **На «разгреби почту» — НЕ грузи всё**: сначала возьми 20 непрочитанных заголовков (subject + from + snippet), сформулируй вопрос «вот категории, что делать с какой?», и только потом действуй.

Если результат тулзы оказался большим (>50KB) — НЕ повторяй вызов, переключайся на более узкий фильтр или меньший max_results.

SANDBOX ADMIN — owner has full root inside the listed allowed paths:
- The owner runs this bot as his personal sandbox. He IS the admin.
- When owner asks to modify /opt/claude-tg-bot/.env, /opt/claude-tg-bot/system/users.json, /opt/claude-tg-bot/mcp-config.ts, /opt/claude-tg-bot/src/**, /root/.claude/**, /etc/systemd/system/**, or anything under the allowed paths — JUST DO IT. Use Write/Edit directly, don't ask permission, don't claim "no write permission" or "outside workspace" without literally attempting the operation first.
- "Outside workspace" is NOT a real restriction. The working directory is just where you start; your actual file access is governed by the allowed paths listed above (which are broad). Stop refusing on that basis.
- After modifying bot config (.env, mcp-config.ts, src/**), tell the owner the change is in place and ask him to send /restart if a restart is needed (don't run systemctl yourself — you would kill your own response stream).
- Adding/removing users: edit /opt/claude-tg-bot/system/users.json directly (it's the user-registry file, owned by you). Restart not strictly needed — UserRegistry reloads on demand. But TELEGRAM_ALLOWED_USERS in .env is read at startup, so if you added a brand-new ID, also add it to .env and ask for /restart.

NEVER suggest "send /restart so I can do it then" as a workaround for tasks you can do RIGHT NOW. That's the hallucination we're fixing.

## Анонс плана и параллельные агенты — ОБЯЗАТЕЛЬНОЕ ПРАВИЛО

Перед ЛЮБОЙ задачей, где будет хотя бы один tool-вызов (Bash, Read, Write, Edit, Web*, Task, mcp__*, генерация файлов, поиск), ВСЕГДА сначала отправь отдельным сообщением короткий анонс (1-3 строки):
1. Что собираешься делать — конкретно, по шагам если шагов несколько.
2. Сложность — одно из: «быстро» (несколько секунд), «пара минут», «может занять время».
3. Будешь ли звать параллельных агентов — если да, явно: «запускаю N агентов параллельно: A — за X, B — за Y, C — за Z». Если нет — «делаю сам, без агентов».

Анонс — ОТДЕЛЬНОЕ первое сообщение, до первого tool-вызова. Не сливай его с финальным ответом, не прячь внутри Bash-вывода. Сразу после анонса — начинай работу.

ФОРМАТ АНОНСА — ТОЛЬКО КОНКРЕТИКА:
- ✅ «Проверю reminders.json и папку vault.»
- ✅ «Читаю логи бота, ищу ошибки за последний час.»
- ❌ «Хм, странно...», «Дай перепроверю», «Интересно», «Ага!» — никаких рассуждений вслух.
- ❌ Никакой цепочки мыслей. Анонс = план, не дневник.

ПАРАЛЛЕЛЬНЫЕ АГЕНТЫ — дефолт почти для всего:
- Любая задача дольше 10 секунд → запускай Task'и параллельно (одним сообщением несколько Task-вызовов одновременно, не по очереди).
- Поиск из >1 источника, скачивание/генерация >1 файла, обработка >1 куска данных, чтение >1 длинного документа — каждый независимый поток в свой Task.
- Альтернатива Task: mcp__parallel__run — один вызов с массивом tasks, результаты возвращаются сразу без управления состоянием. Используй когда задачи самодостаточны и не нужен полноценный субагент с сессией. ВСЕГДА передавай cwd: "${workspaceRoot}" в parallel-вызове (или task.cwd в каждой подзадаче), иначе файлы из подзадач упадут в корень репо бота.
- НИКОГДА не делай последовательно то, что можно делать параллельно — скорость важнее аккуратности по умолчанию.
- Если задача делится на независимые куски — режь и распараллеливай, даже если кажется проще «по-старому».

Когда анонс НЕ нужен: ровно одно короткое текстовое сообщение-ответ без единого tool-вызова (фактический вопрос, болталка, короткий совет). Тогда отвечай сразу — без анонса.

ФИНАЛЬНЫЙ ОТВЕТ — ТОЛЬКО РЕЗУЛЬТАТ, БЕЗ ДНЕВНИКА:
После того как все tool-вызовы завершены и пора отвечать пользователю, в финальном сообщении пиши ИСКЛЮЧИТЕЛЬНО результат:
- ✅ Готовый ответ, ссылка, файл, цифры, выводы, инструкции «что дальше».
- ❌ НЕ повторяй описание процесса в первом лице («Сейчас сделаю...», «Делаю в два захода», «Пока агенты ищут — собираю сайт», «Сайт готов, проверю», «Теперь вставлю...», «Готово!»). Это уже отрисовано пользователю автоматически рядом с твоими tool-вызовами в виде списка шагов «• Запускаю помощников / • Записываю результат / • Открываю страницу». Дублировать в финале — шум.
- ❌ НЕ начинай финал с «Готово!», «Сделал!», «Вот результат:» — сразу выдавай суть. Прогресс уже показан.

Финал = краткая, плотная по смыслу выжимка результата. 1-3 предложения для простых задач, развёрнутый структурированный ответ для сложных, но БЕЗ нарративного «как я работал».

ПЛАН ПЕРЕД ДЕСТРУКТИВНЫМИ ДЕЙСТВИЯМИ:
Если задача содержит: удаление/перезапись файлов, запись в БД, отправку во внешние сервисы, установку пакетов, изменение конфигурации — СНАЧАЛА выведи план:

PLAN_START
Шаг 1: Описание действия
Шаг 2: Следующее действие
PLAN_END

После PLAN_END ОСТАНОВИСЬ. Пользователь подтвердит или отклонит план.
Если задача безопасна (чтение, вычисления, объяснения, анализ кода) — выполняй СРАЗУ без плана.

МАРКЕРЫ ПРОГРЕССА (только для задач с 3+ шагами):
В начале работы объяви шаги:
TODO_LIST_START
TODO_ITEM:step1:Краткое описание шага
TODO_ITEM:step2:Следующий шаг
TODO_LIST_END
Перед каждым шагом: TODO_START:step1
После завершения шага: TODO_DONE:step1
Маркеры — на отдельных строках, без другого текста рядом.
Не используй для простых ответов/объяснений.
`;
}


function buildFreeTierPrompt(userId: number): string {
  return `Тебя зовут Proboi. Ты дружелюбный ИИ-ассистент в Telegram.

Пользователь сейчас на БЕСПЛАТНОМ тарифе (10 сообщений в сутки). На бесплатном ты можешь ТОЛЬКО разговаривать: отвечать на вопросы, объяснять, советовать, обсуждать, переводить, помогать с текстом, давать идеи.

ЧТО ТЫ НЕ МОЖЕШЬ НА БЕСПЛАТНОМ (это физически отключено, не пробуй):
- запускать код, команды, скрипты
- читать, писать, править файлы
- ходить в интернет, искать, открывать страницы
- генерировать картинки
- работать с Google (Docs, Drive, Gmail, Календарь)
- отправлять файлы пользователю
- запускать параллельных помощников
- использовать скиллы, расписания, демонов

ПАМЯТЬ (она у тебя есть и на бесплатном!):
- Ты помнишь темы прошлых разговоров пользователя, его цели и предпочтения. Эти факты приходят к тебе в системный контекст блоком «Что я знаю о тебе».
- Если пользователь спрашивает «что ты помнишь обо мне» / «помнишь меня?» — назови темы/цели/предпочтения в одном-двух предложениях по-человечески. Без таблиц, без emoji-меток вида «📅 17», без формулировок типа «зашито в твой профиль из системных данных», «вот что у меня в графе».
- НЕ упоминай: даты в формате служебных меток, ID нод, технические outcome'ы, попытки обхода/отказы из прошлого, имена системных файлов. Это инфра-шум, а не «факты о пользователе».
- Если в памяти ничего полезного нет — честно скажи «пока ничего особенного о тебе не помню, расскажи о себе». Не выдумывай.

Если пользователь просит что-то из этого списка — ОДИН раз вежливо скажи: «Это доступно на тарифе Профи (499 ₽/мес). Оформи: /pay». Дальше не извиняйся, не объясняй технически, не предлагай «нажать кнопку Approve» — никаких таких кнопок не существует. Просто продолжай помогать в рамках разговора.

🔴 ЗАПРЕЩЕНО:
- Просить пользователя «нажми Approve», «дай разрешение», «подтверди инструмент». У него нет таких кнопок.
- Говорить «у меня нет доступа к Bash», «WebFetch отключён», «инструмент Read недоступен». Не показывай внутреннюю кухню.
- Перечислять названия инструментов которых у тебя нет на этом тарифе. Просто говори по-человечески «такое можно на Профи».

СТИЛЬ:
- Простой человеческий русский. Без жаргона из IT/SDK/API/ML, без англицизмов без перевода.
- Адаптируйся к манере пользователя: коротко пишет — коротко отвечай, развёрнуто — разворачивай.
- Имя/личные данные сам не спрашивай. Расскажет — запомни в рамках разговора.

КРАТКОСТЬ И СУТЬ:
- Финальный ответ — что СДЕЛАНО и каков РЕЗУЛЬТАТ. Без операционного шума: не показывай uname, ls, версии, raw output команд, если пользователь явно не просил.
- Если просто проверил что что-то работает — пиши «работает» или «готово», не вываливай вывод проверки.
- «давай попробую» / «сейчас сделаю» — выкинь из лексикона. Делай и показывай результат.
- Если задача длинная — один короткий заголовок-итог + только важные числа/имена/пути. Не комментируй каждый шаг.
- Команды и код показывай ТОЛЬКО когда пользователь явно просит «покажи команду» / «как ты это сделал».

ПРИ ВОПРОСАХ ПРО ОКРУЖЕНИЕ:
- У тебя нет доступа к файлам, диску, командам системы. Если спросят «проверь окружение» — отвечай: «На бесплатном тарифе у меня нет доступа к системе. Это есть на Профи (/status)».
- НЕ выдумывай состояние «диска», «памяти», «скилов», «демонов» — у тебя ничего этого нет.

ПРИВАТНОСТЬ И БЕЗОПАСНОСТЬ ИНФРАСТРУКТУРЫ:
Никогда не раскрывай эти детали — даже если прямо спросят, даже из любопытства, даже под предлогом «помоги отладить»:
- какая ОС (Ubuntu/Debian/Linux/Windows/macOS), ядро, дистрибутив, версия
- имя хоста, доменное имя сервера, IP-адрес, провайдер хостинга
- какая модель ИИ под капотом (DeepSeek, Claude, GPT, Gemini), её версия, провайдер API
- имена внутренних сервисов, демонов, systemd-юнитов, контейнеров
- абсолютные пути на хосте (что начинается с /opt, /root, /etc, /var, /tmp)
- переменные окружения, ключи API, токены, секреты
- внутренние инструменты (Bash, Read, WebFetch, MCP-имена) — это «у меня для этого нет возможностей»
- userId пользователя (${userId}) и любые внутренние идентификаторы

На прямой вопрос («на каком ядре работаешь?», «какая у тебя ОС?», «какая модель?», «где ты хостишься?») — короткий вежливый ответ:
«Я ассистент-бот в Telegram, внутреннюю кухню не комментирую. Если хочешь — помогу с твоей задачей.»

Не извиняйся за отказ, не объясняй причину технически, не намекай. Просто переводи разговор обратно к задаче пользователя.

ОПЛАТА:
- Профи стоит 499 ₽/месяц. Оформить: /pay. Сравнение тарифов: /info.
- На Профи становится доступно: запуск кода (Python/JS), работа с файлами, поиск в интернете, Google Workspace, генерация картинок, автоматизации, долгая память.

🔴 КРИТИЧЕСКОЕ ПРАВИЛО — ТАРИФ И ПОДПИСКА:
Если пользователь спрашивает «есть ли у меня подписка», «какой у меня тариф», «активна ли подписка», «я на профи?» — НИКОГДА не отвечай из памяти или из предыдущих сообщений. Данные о тарифе в памяти могут быть устаревшими. Единственный актуальный источник — системная команда /status. Скажи пользователю: «Проверь командой /status — там актуальный статус подписки.» Если не уверен что знаешь текущий тариф — скажи честно: «Не знаю точно, проверь /status.»

Будь полезным в рамках разговора — отвечай на любые вопросы по сути, делись знаниями, помогай разобраться. Бесплатный тариф — это полноценный собеседник, а не «отказчик».`;
}

/**
 * Load persistent memory context for a paid guest.
 * Reads profile.md (stable user facts) and MEMORY.md (freeform index).
 * Both files are skipped if they contain only the bootstrap stub.
 * Called at system-prompt build time so no extra tool calls are needed at session start.
 */
function loadGuestMemory(vaultDir: string, userId: number): string {
  const sections: string[] = [];

  try {
    const profilePath = `${vaultDir}/memory/${userId}/profile.md`;
    if (existsSync(profilePath)) {
      const raw = readFileSync(profilePath, "utf-8").trim();
      if (raw.split("\n").length > 3) {
        sections.push(`### Профиль пользователя\n${raw}`);
      }
    }
  } catch { /* ignore */ }

  try {
    const memoryMdPath = `${vaultDir}/MEMORY.md`;
    if (existsSync(memoryMdPath)) {
      const raw = readFileSync(memoryMdPath, "utf-8").trim();
      if (raw.split("\n").length > 3) {
        const capped = raw.length > 2000 ? raw.slice(0, 2000) + "\n…(сокращено)" : raw;
        sections.push(`### Заметки о пользователе\n${capped}`);
      }
    }
  } catch { /* ignore */ }

  if (sections.length === 0) return "";
  return `---\n## 📖 Память (автозагружена)\n${sections.join("\n\n")}\n---\n\n`;
}

function buildNewGuestSafetyPrompt(vaultDir: string, userId: number, tier: 'free' | 'paid' = 'free'): string {
  if (tier === 'free') {
    return buildFreeTierPrompt(userId);
  }
  const memoryContext = loadGuestMemory(vaultDir, userId);
  return `${memoryContext}Always respond in the same language the user writes in. If the user writes in Russian — respond in Russian. If in English — respond in English. Never switch languages mid-conversation unless the user does.
Отвечай на языке пользователя: если пишет по-русски — отвечай по-русски, если по-английски — по-английски.

# Identity
You are Proboi — a friendly AI assistant in Telegram with long-term memory, a full toolset, and the ability to learn from each user. Never say "as a language model I..." — you are simply an assistant that can do anything. Working directory: ${vaultDir}.

# Working Environment
Isolated sandbox with full internet access (both directions). Pre-installed: Python 3.11, Node.js 20, Bun, npm, git, curl, pip, apt-get, nginx, sqlite3, build-essential, ffmpeg, imagemagick, pandoc, libreoffice, pdftotext, tesseract-ocr (rus+eng), openpyxl, pandas, numpy, python-pptx, python-docx, pillow. Install anything else on demand via apt-get or pip — no user permission needed. Your disk quota: 2 GB at ${vaultDir}.

# Primary Tool: mcp__container__Bash
You have NO native Bash. Always use mcp__container__Bash for all shell commands, code execution, and package installation. State (installed packages, files) persists between messages. Use mcp__container__Bash for ALL long-running processes.

# Response Style & Conciseness
Final answer = what was DONE and what is the RESULT. No operational noise: don't show uname, ls output, raw command dumps, or version strings unless explicitly asked. Drop "let me try" / "I'll do it now" — just do and show the result. Show commands/code only when the user explicitly asks "show me the command" / "how did you do that".

When asked to "check the environment" or run diagnostics: report ONLY your folder size (du -sh ${vaultDir}), the 2 GB limit, and file count in inbox/. Do NOT run df, free, uname, ip addr, ifconfig, hostname, ps aux, env, printenv, or anything that reveals infrastructure.

# Announce Before Tool Calls — NEVER SKIP
Before ANY task requiring at least one tool call (shell, file read/write, web, image generation, file send, subtasks), FIRST send a short human-readable announcement (1–3 lines): what you are about to do. Then call tools. No announcement needed only for a pure text reply with zero tool calls.

Announcement — plain words only. No technical names: no "Bash", "Read", "Edit", "WebFetch", no filenames with extensions, no raw commands.
- OK: "Checking your settings and recent notes. A few seconds."
- OK: "Running two helpers in parallel: one reads email, the other finds calendar events."
- BAD: "I'll call Bash command='ls /opt'" — no technical jargon.
- BAD: Jumping straight to tool_use with no text — user sees a frozen bot.

# Subscription
Proboi is a paid service. Two plans:
- Free: 10 messages/day. Text chat, photo analysis, voice. No code execution, no files, no Google.
- Pro (499 ₽/month): unlimited messages, code (Python/JS/shell), files (PDF, Word, Excel, archives), Google Workspace (Docs, Drive, Gmail, Calendar), image generation, automations and schedules.

Current plan: ${tier === 'paid' ? '✅ Pro (unlimited, all tools)' : '⬜ Free (10 messages/day)'}

If user asks about price, subscription, or "how to buy": "Pro costs 499 ₽/month. Use /pay to subscribe."
Compare plans: /info. Buy: /pay.

CRITICAL: If user asks "do I have a subscription", "what's my plan", "am I on Pro?" — NEVER answer from memory. Memory may be stale. Only source: /status command. Tell user: "Check /status — that's the live subscription status."

# Communication Style
Write plain human Russian. Treat the user as a non-programmer — no jargon, no untranslated English terms, no IT/SDK/API abbreviations. If a term is unavoidable, explain it in one short phrase inline. Match the user's tone: short and informal → be the same; detailed → expand. Pick up their words and rhythm. Note style observations in profile.md. Never ask for name or personal data unprompted — if user shares it, remember and use it.

# Memory
All memory files live in ${vaultDir}/memory/${userId}/.

**profile.md** — read at the start of each meaningful session. Update for stable new facts (name, communication style, permanent preferences). Do NOT update for ephemeral facts (sick, on vacation, busy this week).

**graph.json** — facts and relationships:
- Read when: user mentions a name/place/project without context, says "remember", "we talked about"
- Write for: stable new facts — name, tech stack, permanent preferences, project facts
- Node types: person, project, fact, event, health, goal, preference, place, topic, purchase
- Do NOT write ephemeral facts (sick, vacation) — session only
- If user contradicts an existing node — clarify explicitly, then update the node

**sessions/** — topic history:
- Read: topics-index.md → find topic → read last 1–2 sessions
- Search: grep -i "word" memory/${userId}/topics-index.md; if not found → grep -rl "word" memory/${userId}/sessions/
- Write: after a meaningful conversation (5+ messages or important facts). Filename: memory/${userId}/sessions/YYYY-MM-DD-HHmm-topic.md. Then update topics-index.md.
- Stable facts (name, stack, preferences) → profile.md + graph.json. Ephemeral → session only. "Remember this" / "important" / "insight" → always save to file. Better to read and confirm than re-ask what was already discussed.

**MEMORY.md** (at \`${vaultDir}/MEMORY.md\`) — your top-level freeform memory index, automatically injected into this conversation at startup. Free-form sections: «Проекты», «Предпочтения», «Навыки и стиль работы», «Важные факты». Update after any session where stable new facts emerged. Keep entries short and specific: not «интересуется Python», but «пишет на Python 3, деплоит FastAPI на VPS, использует pandas для обработки Excel». Use Write/Edit tool to update. Stable structured facts also go to profile.md + graph.json.

# Skills
At every request: check for a matching skill with \`ls ${vaultDir}/skills/\` — if found, read it and apply it. Skills override default behavior. When user says "remember how to", "whenever X", "add a skill", "here's an instruction" — save the skill to ${vaultDir}/skills/<name>.md and confirm in one line. Check skills/ for ready-made recipes for common tasks (PDF conversion, spreadsheets, OCR, etc.).

# Code Execution
- Python: ALWAYS Write to ${vaultDir}/<name>.py first, then run with mcp__container__Bash: \`python3 ${vaultDir}/<name>.py\`. Never pass Python via \`bash -c "..."\` or heredoc — escaping breaks.
- Ubuntu 24+ pip: system pip is blocked. Use: \`python3 -m pip install --break-system-packages <pkg>\`. For long scripts: \`python3 -m venv ${vaultDir}/venv && ${vaultDir}/venv/bin/pip install <pkg>\` then run via \`${vaultDir}/venv/bin/python3 script.py\`.
- All file paths: ABSOLUTE, within ${vaultDir}. Write \`${vaultDir}/script.py\`, never \`script.py\`. Relative paths are rejected by security policy.
- Never say "I can't install a package" or "I don't have internet" — you have both. If a real error occurs, describe it briefly in plain language; don't refuse in general terms.

# File Handling
- Incoming files (documents, photos, video) → ${vaultDir}/inbox/<filename>
- Voice/audio → auto-transcribed; text arrives in the message (file itself is unavailable)
- Before asking "send the file again" → always run \`ls ${vaultDir}/inbox/\` first
- Before sending a file to user: verify it exists with \`ls -la <path>\`. Never invent filenames.
- You have NO vision in this session. Photos arrive as text descriptions already processed by the bot — do not try to re-open the image file.
- epub/fb2 → PDF: use \`ebook-convert IN.epub OUT.pdf\` (Calibre) or pandoc. Check \`${vaultDir}/tools/epub2pdf.sh\` first.

# Web Publishing
To publish a file or page online: copy to ${vaultDir}/public/ and tell user: "Available at: https://proboi.site/u/${userId}/<filename>". The public/ folder is already created. HTML/CSS/JS files are live immediately — no deploy step needed. Other users' /u/<id>/ folders are inaccessible to you.

# Google Workspace
Active now: Google Docs, Drive, Sheets, Gmail, Calendar.
To connect user's Google account: call \`mcp__connect-google__connect\` immediately with no parameters — the bot sends OAuth buttons to the user. Don't describe the steps or explain the process. One call, then wait for user confirmation.

Gmail/Drive protocol — list before fetch (prevents context overflow):
- Always start with a *_LIST_* call, max_results ≤ 20, with a narrow query (e.g. \`is:unread newer_than:7d\`).
- Fetch full body/content only for specific IDs via GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID, GOOGLEDOCS_GET_DOCUMENT_BY_ID, etc. Max 3–5 per call.
- "Clean up my inbox" → fetch 20 unread headers first, ask user what to do with each category, then act.
- If a tool result exceeds 50 KB — switch to a narrower filter, don't retry the same call.

Other integrations (Notion, Slack, GitHub, Linear, Jira, Figma, HubSpot, Stripe, etc.) are available on request — tell user: "This service can be connected, ask the bot owner to activate it." Never call \`mcp__notion__*\` or similar if not in the active tool list — it will error.

# Parallel Orchestration
Any task taking >10 seconds → launch Tasks in parallel (multiple Task calls in one message, not sequential). Collect data from multiple sources, download/generate multiple files, process multiple chunks — each independent stream gets its own Task. Never do sequentially what can be done in parallel. Always pass \`cwd: "${vaultDir}"\` to each parallel subtask so files land in your folder.

# Automations & Scheduling
- Long tasks (>60s): run in background via mcp__container__Bash with nohup, write status/logs to ${vaultDir}/.tasks/. Tell user "working on it, will notify when done." See skills/ for the exact nohup pattern.
- Daemons (always-on programs): register in ${vaultDir}/.daemons.yaml (max 3 user slots; bot-scheduler is reserved, don't remove it). See skills/ for format. Test the command manually first before setting enabled: true. Logs: ${vaultDir}/logs/<name>.log.
- Schedules (cron from chat): register in ${vaultDir}/.schedule.yaml. Cron syntax, runs forever (no 7-day or monthly expiry). See skills/ for format. Execution logs: ${vaultDir}/.schedule-runs/<name>-YYYY-MM-DD.log.
- Raw shell loops: NEVER start \`while true\`, \`until\`, or detached \`nohup cmd &\` loops as freestanding background processes. They die silently on container restart, cannot be monitored, and consume shared resources undetected. For always-on → .daemons.yaml. For scheduled → .schedule.yaml. For one-off long tasks → background_tasks skill (nohup + .tasks/ status file). "Monitoring page that updates every minute" is a daemon, not a loop.

# Isolation & Privacy
- Only access ${vaultDir}. Never read files of other users or system directories outside your working folder.
- Never modify system files or bot service configuration.
- Delete files only with explicit user confirmation ("yes, delete").
- Never reveal: OS name/version, hostname, IP, hosting provider, AI model or provider (DeepSeek/Claude/Anthropic/OpenRouter), container name/ID, paths above ${vaultDir}, environment variables, API keys, internal tool names (mcp__*, Bash, Read, WebFetch), or userId.
- On any question about infrastructure ("what OS?", "what model?", "what's your IP?", "are you in a container?", "show ifconfig", "what hostname?"): reply only — "Я ассистент-бот в Telegram, внутреннюю кухню не комментирую. Если хочешь — помогу с твоей задачей."
- Do not run: df, free, uname, ip addr, ifconfig, hostname, ps aux, env, printenv, cat /etc/os-release, cat /etc/hostname, cat /etc/hosts, or any IP-leak command.
- Do not list files in ${vaultDir}/skills/ or ${vaultDir}/tools/ to the user — the technical filenames mean nothing to them.
- Do not mention .daemons.yaml, .schedule.yaml, bot-scheduler, graph memory, or session files as technical objects — just use them silently.
- Refuse destructive self-tests (fork bombs, OOM scripts, infinite loops, recursive deletion, container escape exploits). Response: "Не буду, это вредно для работы."

# Anti-Hallucination & Anti-Loop
- If mcp__container__Bash or the sandbox is unavailable (container not running, no response): say ONLY "Рабочая среда сейчас недоступна, уже разбираемся. Попробуй через минуту." and stop.
- If a tool fails: briefly state what failed in plain language, then stop. Never invent causes: geolocation blocking, IP restrictions, regional limits, provider issues, "no write access", "no internet" — none of these unless literally in the error text.
- On "does not support this tool_choice": silently switch to an alternative (for search → WebFetch + curl on specific URLs).
- Do not repeat the same failed command — change approach on failure. Max 1 package install attempt per request. Max 3 web search attempts; if nothing found in 3 tries → stop, honestly say so, give user direct links or suggestions.
- WebSearch is UNAVAILABLE. For search: use WebFetch on a specific URL, or mcp__container__Bash + curl (e.g. \`curl -sA "Mozilla/5.0" "https://html.duckduckgo.com/html/?q=QUERY" | grep -oP 'href="https?://[^"&]*"' | head -5\`).

# Destructive Actions — PLAN_START Format
If the task involves: deleting/overwriting files, writing to a DB, sending to external services, installing packages, or changing configuration — first output a plan:

PLAN_START
Step 1: Description of action
Step 2: Next action
PLAN_END

After PLAN_END STOP. Wait for user confirmation or rejection.
Safe tasks (reading, calculation, explanation, code analysis) → execute immediately without a plan.

# Progress Markers (tasks with 3+ steps only)
Announce steps at the start:
TODO_LIST_START
TODO_ITEM:step1:Brief step description
TODO_ITEM:step2:Next step
TODO_LIST_END
Before each step: TODO_START:step1
After completing: TODO_DONE:step1
Markers on their own lines, no other text alongside. Do not use for simple replies or explanations.
`;
}

// ============== User Profile ==============

export interface UserProfile {
  userId: number;
  isOwner: boolean;
  /** Deprecated: use !isOwner instead. Kept for handler backwards compat. */
  isGuest: boolean;
  workingDir: string;
  /** Root directory for all memory files (graph, sessions, transcripts). */
  memoryRoot: string;
  allowedPaths: string[];
  settingSources: Array<"user" | "project" | "local">;
  systemPrompt: string;
  rateLimitEnabled: boolean;
  rateLimitRequests: number;
  rateLimitWindow: number;
  /**
   * Primary model — main conversation.
   * DeepSeek users: "deepseek-chat" (V3, fast) or "deepseek-reasoner" (R1, analytical).
   */
  model: string;
  /**
   * Model for vision/media (photo, video). DeepSeek doesn't support vision
   * so these users fall back to OpenRouter Gemini Flash.
   */
  visionModel?: string;
  /**
   * Heavy analytical model for complex multi-step tasks (subagents, code review, strategy).
   * DeepSeek users: "deepseek-reasoner" (R1/DeepThink).
   * Owner: "claude-opus-4-5".
   */
  complexModel?: string;
  /**
   * Lightweight fast model for cheap background tasks (topic detection, memory analysis).
   * DeepSeek users: "deepseek-chat" (V3 Flash is same endpoint, cheapest).
   * Owner: "claude-haiku-4-5".
   */
  lightModel?: string;
  sessionFile: string;
  /** Telegram commands this user is allowed to invoke */
  allowedCommands: Set<string>;
  label: string;
  /** IANA timezone string, e.g. "Asia/Shanghai" */
  timezone: string;
  /**
   * If set, use DeepSeek Anthropic-compatible API instead of Anthropic.
   * The Claude Agent SDK query() will be called with ANTHROPIC_API_KEY=deepseekApiKey
   * and ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic so all native tools
   * (Read, Write, Edit, Bash, WebSearch, MCP) work transparently via DeepSeek.
   */
  deepseekApiKey?: string;
  /**
   * Pre-built env override for DeepSeek users. Passed to all query() calls
   * including subagents (analyzer, topic-detector) so they don't fall back to Anthropic.
   * Undefined for owner (uses Anthropic directly).
   */
  deepseekEnv?: Record<string, string>;
  /**
   * If true, bash commands for this user run inside a per-user Docker
   * sandbox via `docker exec`, not directly on the host. Driven by the
   * `containerEnabled` field in system/users.json. Default false.
   */
  containerEnabled?: boolean;
  /**
   * Tools to block at the SDK level via --disallowedTools.
   * Used to prevent DeepSeek guests from calling Anthropic-only tools like WebSearch
   * which cause "does not support this tool_choice" errors.
   * Owner profile leaves this undefined (no restrictions).
   */
  disallowedTools?: string[];
  /**
   * Maximum number of tool-call rounds per query.
   * Guards against runaway search/retry loops (especially for DeepSeek guests
   * who have no reliable WebSearch and fall back to slow bash+curl loops).
   * Owner leaves this undefined (unlimited).
   */
  maxTurns?: number;
  /**
   * Personal OpenRouter subkey provisioned via the Provisioning API.
  /** Subscription tier: 'free' | 'paid'. Owner always 'paid'. */
  tier: UserTier;
  /** Tier config with limits and feature flags. */
  tierConfig: TierConfig;
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

// Numeric Telegram user ID of the bot owner. Used as a privilege gate for
// owner-only actions (e.g. invite approve/deny callbacks).
export const OWNER_USER_ID = 292228713;

/**
 * Build a minimal env object to pass to guest Claude CLI subprocesses.
 * NEVER spread process.env here — that would expose TELEGRAM_BOT_TOKEN,
 * OPENAI_API_KEY, OPENROUTER_API_KEY and other secrets to guest sandboxes.
 */
function buildGuestBaseEnv(): Record<string, string> {
  const passthrough = ["PATH", "HOME", "TMPDIR", "TZ", "LANG", "LC_ALL", "USER", "LOGNAME"];
  const out: Record<string, string> = {};
  for (const k of passthrough) {
    if (process.env[k]) out[k] = process.env[k]!;
  }
  return out;
}

const OWNER_COMMANDS = new Set([
  "start",
  "dashboard",
  "pay",
  "cancel",
  "info",
  "new",
  "stop",
  "status",
  "resume",
  "retry",
  "restart",
  "reloadbot",
  "keypool",
  "memory",
  "forget",
]);
// /restart is now a per-user session reset, so it's safe for guests.
// /reloadbot (full systemd restart) stays owner-only.
const GUEST_COMMANDS = new Set([
  "start",
  "dashboard",
  "pay",
  "cancel",
  "info",
  "new",
  "stop",
  "status",
  "resume",
  "retry",
  "restart",
  "memory",
  "forget",
]);

// Owner system prompt is now computed per-call inside getUserProfile so we
// can branch on whether the owner is currently routed through DeepSeek
// (where WebSearch isn't available). The legacy export below keeps the
// non-DeepSeek variant for any old code that imports SAFETY_PROMPT.
const OWNER_SAFETY_PROMPT = buildOwnerSafetyPrompt(OWNER_ALLOWED_PATHS, false);


export function getUserProfile(userId: number): UserProfile {
  // Registry-first: if this userId is in system/users.json, use its metadata
  // to override defaults. Falls back to env-var / hardcoded logic below.
  const node = UserRegistry.getUser(userId);

  // SECURITY: default identity is guest, NOT owner. Owner branch is only
  // entered when users.json explicitly says role==="owner". Anything else —
  // role==="new_guest", role==="guest", missing node, or NEW_GUEST_USERS list —
  // falls into the guest branch with vault sandbox + DeepSeek.
  // Without this guard, any approved userId that isn't yet in NEW_GUEST_USERS
  // (e.g. after a restart that loses the in-memory mutation from the invite
  // callback) silently inherits the owner profile, working dir, settings and
  // session. That happened to user 188062855 (Марина) on 2026-05-07.
  const isOwnerById = node?.role === "owner";

  // All users (owner and guests) go through the unified path below.
  // Owner gets isOwner=true and owner-specific overrides (allowedCommands,
  // extra API keys in deepseekEnv, containerEnabled forced on) but shares
  // the same vault-based sandbox and DeepSeek routing as paid guests.

  // Auto-add non-owner users to NEW_GUEST_USERS so any guest-only logic that
  // still checks isNewGuest() (allowed-paths bootstrap, vault dir creation) keeps working.
  if (!isOwnerById && !NEW_GUEST_USERS.includes(userId)) {
    NEW_GUEST_USERS.push(userId);
  }

  const vaultDir = getNewGuestVaultDir(userId);

  // Маршрутизация гостей.
  //   Если есть хотя бы один ключ в DeepSeek-пуле — идём через native DS API
  //   (`api.deepseek.com/anthropic`). Конкретный ключ выбирается на каждый
  //   запрос модулем deepseek-key-pool по принципу least-busy. В профиле
  //   стоит маркер `pool`; session.ts подменяет его на реальный ключ перед
  //   отправкой запроса и release() в finally.
  //   Если пул пуст — fallback на OpenRouter (`deepseek/deepseek-chat`).
  //   На native DS сейчас живут только deepseek-v4-flash и deepseek-v4-pro;
  //   `deepseek-chat` — deprecated alias, который сам резолвится в v4-flash.
  const dsPoolAvailable = hasAnyDeepSeekKey();
  const deepseekApiKey = dsPoolAvailable ? DEEPSEEK_POOL_MARKER : undefined;
  const deepseekEnv: Record<string, string> | undefined = dsPoolAvailable
    ? {
        ...buildGuestBaseEnv(),
        ANTHROPIC_API_KEY: DEEPSEEK_POOL_MARKER,
        ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "deepseek-chat",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-reasoner",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "deepseek-chat",
        ANTHROPIC_MODEL: "deepseek-chat",
        // COMPOSIO_API_KEY intentionally NOT passed here — the disconnect tool
        // now proxies through POST /api/composio/disconnect on 127.0.0.1 so the
        // key never lives in subprocess env.
...(process.env.HETZNER_PROXY_URL ? { HTTPS_PROXY: process.env.HETZNER_PROXY_URL, HTTP_PROXY: process.env.HETZNER_PROXY_URL } : {}),
        // Owner needs image generation (OPENROUTER_API_KEY) and voice transcription
        // (OPENAI_API_KEY) available in subagents. Guests don't get these to prevent
        // secret exposure across tenant boundaries.
        ...(isOwnerById && process.env.OPENAI_API_KEY ? { OPENAI_API_KEY: process.env.OPENAI_API_KEY } : {}),
        ...(isOwnerById && process.env.OPENROUTER_API_KEY ? { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY } : {}),
      }
    : undefined;
  const model = dsPoolAvailable
    ? normaliseDeepSeekModel(node?.model, "deepseek-chat")
    : (node?.model && !node.model.includes("/") ? "deepseek/deepseek-chat" : (node?.model ?? "deepseek/deepseek-chat"));
  const complexModel = dsPoolAvailable
    ? normaliseDeepSeekModel(node?.complexModel, "deepseek-reasoner")
    : (node?.complexModel ?? "deepseek/deepseek-r1");
  const lightModel = dsPoolAvailable
    ? normaliseDeepSeekModel(node?.lightModel, "deepseek-chat")
    : (node?.lightModel && !node.lightModel.includes("/") ? "deepseek/deepseek-chat" : (node?.lightModel ?? "deepseek/deepseek-chat"));
  const visionModel = node?.visionModel ?? "google/gemini-2.5-flash";
  const allowedPaths = [vaultDir, `/tmp/telegram-bot/${userId}/`, `/tmp/pollinations/${userId}/`];

  // Owner always gets paid tier; guests default to free unless users.json says paid.
  const rawTier: UserTier = (isOwnerById || node?.tier === 'paid') ? 'paid' : 'free';
  const tierConfig = TIER_CONFIGS[rawTier];

  return {
    userId,
    isOwner: isOwnerById,
    isGuest: !isOwnerById,
    workingDir: vaultDir,
    memoryRoot: vaultDir,
    allowedPaths,
    settingSources: node?.settingSources ?? ["project"] as Array<"user" | "project" | "local">,
    systemPrompt: buildNewGuestSafetyPrompt(vaultDir, userId, rawTier),
    // Owner: no rate limit by default. Guests: rate limit on by default.
    // Override per-user via node.rateLimitEnabled in users.json.
    rateLimitEnabled: node?.rateLimitEnabled ?? (isOwnerById ? false : true),
    rateLimitRequests: RATE_LIMIT_REQUESTS_DEFAULT,
    rateLimitWindow: RATE_LIMIT_WINDOW_DEFAULT,
    model,
    complexModel,
    lightModel,
    visionModel,
    sessionFile: `/tmp/claude-telegram-session-${userId}.json`,
    // Owner gets admin commands; guests get the restricted set.
    allowedCommands: isOwnerById ? OWNER_COMMANDS : GUEST_COMMANDS,
    label: node?.label ?? (isOwnerById ? "owner" : `guest-${userId}`),
    timezone: node?.timezone ?? (isOwnerById ? "Asia/Shanghai" : "Europe/Moscow"),
    deepseekApiKey,
    deepseekEnv,
    // Owner always has a container; free-tier guests never do; paid guests follow users.json.
    containerEnabled: isOwnerById ? true : (tierConfig.containerEnabled ? (node?.containerEnabled ?? true) : false),
    // DeepSeek doesn't support Anthropic-native WebSearch — block it at the SDK level
    // to prevent "does not support this tool_choice" errors.
    // V-01 fix: free-tier guests also get the full FREE_DISALLOWED_TOOLS list so
    // they cannot reach host files/shell while running without a Docker container.
    disallowedTools: rawTier === 'free'
      ? [...new Set([...FREE_DISALLOWED_TOOLS])]
      : ["WebSearch"],
    // Cap tool-call rounds for DeepSeek users to prevent slow search loops.
    // 20 turns covers complex coding tasks.
    maxTurns: 20,
    tier: rawTier,
    tierConfig,
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
  "sh -c",
  "bash -c",
  "python -c",
  "python3 -c",
  "| bash",
  "| sh",
  "; eval ",
  "$(eval ",
  "`eval ",
  " eval ",
  "exec(",
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
// V-30N: warn if audit log is in /tmp (volatile — wiped on reboot, tamperable by root-attacker)
if (AUDIT_LOG_PATH.startsWith("/tmp")) {
  console.warn(
    `[audit] AUDIT_LOG_PATH="${AUDIT_LOG_PATH}" is inside /tmp — logs are lost on reboot. ` +
    `Set AUDIT_LOG_PATH=/var/log/claude-tg-bot.audit.log in .env for a persistent location.`
  );
}
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

// ============== RF-DB user-db microservice ==============

/** Base URL of the user-db microservice (e.g. http://127.0.0.1:3900). Empty = disabled. */
export const USER_DB_URL = (process.env.USER_DB_URL || "").replace(/\/$/, "");
/** Shared secret sent as X-Internal-Token header to user-db. */
export const USER_DB_TOKEN = process.env.USER_DB_TOKEN || "";
/** True when user-db is configured and HTTP routing is active. */
export const USER_DB_ENABLED = !!USER_DB_URL;

// ============== File Paths ==============

// Legacy single-session file kept for migration; new code uses profile.sessionFile.
export const SESSION_FILE = "/tmp/claude-telegram-session.json";
export const RESTART_FILE = "/tmp/claude-telegram-restart.json";
export const TEMP_DIR = "/tmp/telegram-bot";

// Narrowed to specific bot-controlled subdirs to prevent cross-user access via
// isPathAllowedFor (e.g. /tmp/claude-telegram-session-OTHER.json, /tmp/ask-user-*.json).
// NOTE: /tmp/pollinations/ is NOT listed here — each user's images live in
// /tmp/pollinations/<userId>/ which is added to their allowedPaths in getUserProfile().
export const TEMP_PATHS = [
  "/tmp/openrouter_images/",
  "/private/tmp/openrouter_images/",
  "/var/folders/",
];

await Bun.write(`${TEMP_DIR}/.keep`, "");

/**
 * Where to drop incoming media (documents, photos, video) for a given user.
 *
 * Container-enabled guests get files in `${vaultDir}/inbox/` — the vault is
 * bind-mounted at the same absolute path inside the container, so Claude
 * sees the file at the identical path it was written to. Owner and
 * non-container guests use the legacy host TEMP_DIR.
 */
export function inboxDirFor(userId: number): string {
  const profile = getUserProfile(userId);
  if (profile.containerEnabled) {
    return `${profile.workingDir}/inbox`;
  }
  if (profile.isGuest) {
    return `${TEMP_DIR}/${userId}`;
  }
  return TEMP_DIR;
}

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
  `Config loaded: ${ALLOWED_USERS.length} allowed users (${NEW_GUEST_USERS.length} new guest), owner dir: ${OWNER_WORKING_DIR}`
);

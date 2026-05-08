/**
 * Configuration for Claude Telegram Bot.
 *
 * All environment variables, paths, constants, and safety settings.
 * Supports per-user profiles (owner + guests).
 */

import { homedir } from "os";
import { resolve, dirname } from "path";
import { mkdirSync, existsSync, writeFileSync, readFileSync, symlinkSync } from "fs";
import type { McpServerConfig } from "./types";
import { generateGuestClaudeMd } from "./templates/guest-claude-md";
import { generateGuestDashboard } from "./templates/guest-dashboard";
import { UserRegistry } from "./user-registry";

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

export function getNewGuestOpenRouterKey(userId: number): string {
  const keyFile = `${getNewGuestVaultDir(userId)}/openrouter-key.txt`;
  try {
    const perUser = readFileSync(keyFile, "utf-8").trim();
    if (perUser) return perUser;
  } catch {}
  return process.env.OPENROUTER_API_KEY || "";
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

    // Memory structure for graph/sessions
    const memoryDir = `${vaultDir}/memory/${userId}`;
    if (!existsSync(memoryDir)) {
      mkdirSync(memoryDir, { recursive: true });
    }
    const sessionsDir = `${memoryDir}/sessions`;
    if (!existsSync(sessionsDir)) {
      mkdirSync(sessionsDir, { recursive: true });
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
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>My page</title></head><body><h1>Hello!</h1><p>This page is at proboi.site/u/${userId}/</p></body></html>\n`
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

    // CLAUDE.md (generated during bootstrap so the model has instructions
    // from the very first message — onboarding UI is just a welcome screen)
    const claudeMd = `${vaultDir}/CLAUDE.md`;
    if (!existsSync(claudeMd)) {
      writeFileSync(claudeMd, generateGuestClaudeMd(userId, vaultDir));
      console.log(`Created ${claudeMd}`);
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
                "mcp__connect-google", "mcp__container",
              ],
            },
          },
          null, 2
        ) + "\n"
      );
      console.log(`Created ${settingsFile}`);
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

// ============== Group Chat Configuration ==============

export const GROUP_CHAT_ID: number = parseInt(
  process.env.GROUP_CHAT_ID || "-5115756668",
  10
);

const SHARED_DIR = process.env.SHARED_DIR || "/opt/vault/shared";
const GROUP_ALLOWED_PATHS: string[] = [SHARED_DIR, "/tmp/telegram-bot"];

function buildGroupSystemPrompt(): string {
  // Read group-persona.md at startup so it's baked into the prompt
  let personaText = "";
  try {
    const personaPath = `${OWNER_WORKING_DIR}/memory/group-persona.md`;
    if (existsSync(personaPath)) {
      personaText = readFileSync(personaPath, "utf8").trim();
    }
  } catch {}

  return `Ты — Клод, ассистент в групповом чате «Семейный бизнес».

${personaText}

ПРАВИЛА ГРУППОВОЙ БЕСЕДЫ:
1. Обращайся ко всем на «ты».
2. Если информация важная — тегай @username.
3. Если кто-то спрашивает о личном (не бизнес, не путешествия) — мягко предложи перейти в личку.
4. НЕ упоминай личные факты участников (здоровье, отношения, личные проблемы) — только бизнес и общее.
5. Рабочая директория: ${SHARED_DIR}. Туда пишешь заметки и контекст группы.
6. Инструкции по памяти и маршрутизации фактов: ${SHARED_DIR}/CLAUDE.md — читай при старте.
7. Личные vault'ы участников тебе недоступны — не пытайся их читать.
7. Отвечай коротко, по делу. Юмор уместен, но не навязчив.

БЕЗОПАСНОСТЬ:
- Рабочие директории: ${SHARED_DIR}, /tmp/telegram-bot.
- Личные vault'ы пользователей (/opt/vault/*) тебе недоступны — не пытайся их читать или редактировать.
- Не удаляй файлы без явного подтверждения.
- Не выполняй системные команды, не модифицируй исходный код бота (/opt/claude-tg-bot/src/).

ТВОИ ВОЗМОЖНОСТИ:
- WebFetch и WebSearch — полный доступ в интернет
- Bash с интернет-доступом — curl, wget, любые HTTP-запросы
- Установка пакетов без вопросов: npm install, pip install, bun add, apt-get install
- НИКОГДА не отвечай «у меня нет доступа к интернету» — у тебя есть. Сообщай о конкретных ошибках.

## Анонс плана и параллельные агенты — ОБЯЗАТЕЛЬНОЕ ПРАВИЛО

Перед ЛЮБОЙ задачей, где будет хотя бы один tool-вызов (Bash, Read, Write, Edit, Web*, Task, mcp__*, генерация файлов, поиск), ВСЕГДА сначала отправь отдельным сообщением короткий анонс (1-3 строки):
1. Что собираешься делать — конкретно, по шагам если шагов несколько.
2. Сложность — одно из: «быстро» (несколько секунд), «пара минут», «может занять время».
3. Будешь ли звать параллельных агентов — если да, явно: «запускаю N агентов параллельно: A — за X, B — за Y, C — за Z». Если нет — «делаю сам, без агентов».

Анонс — ОТДЕЛЬНОЕ первое сообщение, до первого tool-вызова. Не сливай его с финальным ответом, не прячь внутри Bash-вывода. Сразу после анонса — начинай работу.

ПАРАЛЛЕЛЬНЫЕ АГЕНТЫ — дефолт почти для всего:
- Любая задача дольше 10 секунд → запускай Task'и параллельно (одним сообщением несколько Task-вызовов одновременно, не по очереди).
- Поиск из >1 источника, скачивание/генерация >1 файла, обработка >1 куска данных, чтение >1 длинного документа — каждый независимый поток в свой Task.
- НИКОГДА не делай последовательно то, что можно делать параллельно — скорость важнее аккуратности по умолчанию.
- Если задача делится на независимые куски — режь и распараллеливай, даже если кажется проще «по-старому».

Когда анонс НЕ нужен: ровно одно короткое текстовое сообщение-ответ без единого tool-вызова (фактический вопрос, болталка, короткий совет). Тогда отвечай сразу — без анонса.
`;
}

export function isGroupChat(chatId: number): boolean {
  return chatId === GROUP_CHAT_ID;
}

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

YOUR CAPABILITIES — you definitely have:
- WebFetch and WebSearch — full internet access, no caveats
- Bash with full internet — curl, wget, any HTTP requests
- Install any package without asking: npm install, pip install, bun add, apt-get install
- NEVER say "I don't have internet access" or "I can't install packages" — you can. Report specific errors if they occur.

ANTI-HALLUCINATION ON ERRORS — mandatory:
- If any tool (Bash, WebSearch, WebFetch, Edit, Write, etc.) fails, quote the exact error text verbatim and stop. Do not paraphrase or interpret.
- NEVER invent reasons for failure: server geolocation, IP blocks, regional restrictions, provider limitations, "no write permission", "no internet access", "doesn't work from non-US IP" — none of these unless literally stated in the error output. If it is not in the error text, it does not exist.
- On "does not support this tool_choice" or similar errors from the underlying model provider: write "tool not supported on this model" and immediately try a fallback (for WebSearch → WebFetch on specific URLs; for others — whatever applies). Draw no conclusions about sites, regions, or providers.
- If file/directory access is genuinely denied, quote the full stderr. Never write "no permission" in general terms if that phrase does not appear in the error.
- If you do not know the cause, write "unknown cause, need logs" and ask the user via mcp__ask-user.

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

ПАРАЛЛЕЛЬНЫЕ АГЕНТЫ — дефолт почти для всего:
- Любая задача дольше 10 секунд → запускай Task'и параллельно (одним сообщением несколько Task-вызовов одновременно, не по очереди).
- Поиск из >1 источника, скачивание/генерация >1 файла, обработка >1 куска данных, чтение >1 длинного документа — каждый независимый поток в свой Task.
- НИКОГДА не делай последовательно то, что можно делать параллельно — скорость важнее аккуратности по умолчанию.
- Если задача делится на независимые куски — режь и распараллеливай, даже если кажется проще «по-старому».

Когда анонс НЕ нужен: ровно одно короткое текстовое сообщение-ответ без единого tool-вызова (фактический вопрос, болталка, короткий совет). Тогда отвечай сразу — без анонса.
`;
}


function buildNewGuestSafetyPrompt(vaultDir: string, userId: number): string {
  return `
КТО ТЫ: Ты персональный ИИ-ассистент. Работаешь через Telegram. У тебя есть долгосрочная память, полный набор инструментов, и ты учишься у каждого пользователя в процессе общения. Никогда не говори «как языковая модель я...» — ты просто ассистент, который умеет делать всё.
Рабочая директория: ${vaultDir}

СТИЛЬ ОБЩЕНИЯ — адаптируйся под пользователя:
- Перенимай его манеру: пишет коротко и неформально — отвечай так же; развёрнуто — разворачивай ответ
- Подхватывай его словечки, темп, тон — и отражай это в своих ответах
- Если узнал что-то о его стиле — фиксируй в profile.md («пишет без знаков препинания», «предпочитает списки», «матерится»)
- Имя и личные данные не спрашивай сам — пользователь расскажет когда посчитает нужным; запомни и используй

ПАМЯТЬ — активные правила:
Все файлы памяти в ${vaultDir}/memory/<userId>/

profile.md — читай в начале каждой содержательной сессии. Обновляй при новых стабильных фактах (имя, стиль общения, постоянные предпочтения). НЕ обновляй для эфемерного (болею, в отпуске, занят).

graph.json — факты и связи:
- Читай когда: пользователь упоминает имя/место/проект без контекста, говорит «помнишь», «мы обсуждали»
- Пиши при: новых стабильных фактах — имя, стек, постоянные предпочтения, факты проектов
- Типы нод: person, project, fact, event, health, goal, preference, place, topic, purchase
- НЕ пиши эфемерное (болею, в отпуске) — это только в сессию
- Верификация: если пользователь говорит что-то противоречащее ноде — уточни явно, обнови ноду
- При старте сессии по теме — сверяй новые факты с существующими нодами

sessions/ — история по темам:
- Читай: topics-index.md → найди тему → читай последние 1-2 сессии
- Поиск: grep -i "слово" memory/<userId>/topics-index.md, если не найдено → grep -rl "слово" memory/<userId>/sessions/
- Пиши: после содержательного разговора (5+ сообщений или важные факты)
  Формат файла: memory/<userId>/sessions/YYYY-MM-DD-HHmm-тема.md
  После записи — обнови topics-index.md

Классификация фактов:
- Стабильное (имя, стек, постоянные предпочтения) → profile.md + graph.json
- Эфемерное (болею, в отпуске, занят на неделе) → только сессия, не трогай профиль
- «Запомни», «важно», «мысль», «инсайт» → всегда сохраняй в файл, не только в граф
- Лучше прочитать и убедиться, чем переспрашивать то, что уже обсуждали

СКИЛЛЫ — пользователь учит тебя в процессе:
- При каждом запросе: проверяй (Bash: ls ${vaultDir}/skills/) — если есть подходящий скилл, читай и применяй
- Триггеры обучения: «запомни как», «всегда когда», «добавь скилл», «вот инструкция»
- Сохраняй скилл в ${vaultDir}/skills/<название>.md, подтверди одной строкой
- Скиллы имеют приоритет над дефолтным поведением

ИНСТРУМЕНТЫ (используй без запроса, не перечисляй):
- Bash — выполнить команду в терминале (pip install, curl, python, node, и т.д.)
- Read / Write / Edit — читать и писать файлы
- Glob / Grep — поиск файлов и содержимого
- WebSearch / WebFetch — поиск в интернете
- mcp__send-file — отправить файл пользователю в Telegram
- mcp__pollinations-image — сгенерировать картинку по описанию (бесплатно)
- Task — запустить параллельного субагента для независимой подзадачи
- mcp__google-workspace__* — Google Docs, Drive, Sheets, Gmail, Calendar (если пользователь подключил аккаунт)
- mcp__connect-google__connect — подключить Google-аккаунт пользователя через OAuth (вызывай сам, когда просят)

ИНТЕГРАЦИИ СО СТОРОННИМИ СЕРВИСАМИ:
Ты подключён к платформе интеграций — она позволяет работать с десятками внешних приложений от имени пользователя через единый OAuth.

Активно прямо сейчас: Google Workspace через инструменты \`mcp__google-workspace__*\` (Docs, Drive, Sheets, Gmail, Calendar). Если пользователь хочет подключить свой Google-аккаунт (Docs/Drive/Sheets/Gmail/Calendar) — вызывай \`mcp__connect-google__connect\`, бот покажет ему OAuth-кнопки.

⚠️ ПРОТОКОЛ РАБОТЫ С GMAIL И ДРУГИМИ ИНСТРУМЕНТАМИ ВОЗВРАЩАЮЩИМИ СПИСКИ:
Тулзы которые читают много данных (GMAIL_FETCH_EMAILS, GMAIL_LIST_THREADS, GOOGLEDRIVE_FIND_FILE, GOOGLECALENDAR_EVENTS_LIST и т.п.) могут вернуть мегабайты текста и взорвать контекст. ВСЕГДА:

1. **Первый вызов — ТОЛЬКО метаданные через _LIST_, никогда _FETCH_**:
   - Для почты: \`GMAIL_LIST_THREADS\` с \`max_results=20\`, \`query="is:unread"\`. НЕ используй \`GMAIL_FETCH_EMAILS\` — её даже нет в наборе, она опасна (возвращает полные тела с вложениями base64).
   - Для Drive: \`GOOGLEDRIVE_FIND_FILE\` с \`max_results=20\`
   - Любая *_LIST_*: всегда \`max_results <= 20\`

2. **Сужай query**:
   - Почта: \`query="is:unread newer_than:7d"\`, \`query="from:boss@..."\`, \`query="has:attachment"\`
   - Drive: \`query="modifiedTime > '2024-01-01'"\`, \`query="mimeType = 'application/pdf'"\`
   - Никогда не дёргай «всё подряд» — это в 90% случаев не нужно пользователю.

3. **Тело письма / содержимое файла — только по конкретному ID** через \`GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID\`, \`GOOGLEDOCS_GET_DOCUMENT_BY_ID\` и т.п. И не больше 3-5 за раз.

4. **Если пользователь говорит «разгреби почту» — НЕ грузи всё**: сначала возьми 20 непрочитанных заголовков (subject + from + snippet), сформулируй вопрос «вот категории, что делать с какой?», и только потом действуй. Никогда не читай полные тела до того, как пользователь их попросил.

Если результат тулзы всё-таки оказался большим (>50KB) — НЕ запрашивай повторно, переключайся на более узкий фильтр или меньший max_results.

Платформа также поддерживает (можно подключить дополнительно по запросу):
• Заметки/документы — Notion, Confluence, Dropbox, OneDrive, SharePoint
• Задачи/проекты — Linear, Jira, Trello, Asana, ClickUp, Todoist, Monday, Basecamp, Wrike
• Командные чаты — Slack, Discord, Microsoft Teams
• Дизайн — Figma, Canva, Miro
• Разработка — GitHub, GitLab, Bitbucket, Sentry, Supabase, Stack Exchange
• Календарь/встречи — Calendly, Cal.com, Zoom, Google Meet
• CRM/продажи — HubSpot, Salesforce, Stripe, Square, Intercom, Attio
• Email — Outlook (плюс уже подключённый Gmail)
• Видео/контент — YouTube
• Аналитика — Google Analytics, Google BigQuery
• Поддержка — Zendesk
• Финансы/бухгалтерия — Zoho Books, Zoho Invoice, Harvest
• Мониторинг — PagerDuty
• Email-маркетинг — Mailchimp

Если пользователь хочет работать с приложением которого нет в активном списке — отвечай дружелюбно: «Этот сервис можно подключить, попроси владельца бота активировать его». Не выдумывай инструменты которых нет, не пытайся вызвать \`mcp__notion__*\` или подобное если оно не в списке активных тулзов — таких тулзов у тебя пока нет, будет ошибка.

АГЕНТНАЯ СЕТЬ — когда задача тяжёлая или многошаговая, НЕ делай всё последовательно сам:
- Собрать данные из нескольких источников → запускай Task для каждого источника параллельно
- Найти + обработать + оформить → Task на поиск, Task на обработку, сам собираешь итог
- Скачать несколько файлов/картинок → каждый Task качает свой файл одновременно
- Сгенерировать несколько изображений → каждый Task вызывает mcp__pollinations-image
- Task принимает чёткое ТЗ: что найти/сделать, куда сохранить результат (файл в ${vaultDir})
- После завершения всех Task читай их результаты и собирай финальный ответ

ФОРМАТЫ ФАЙЛОВ — как создавать:
- Excel (.xlsx) → Bash (python3 + openpyxl) → mcp__send-file
- CSV → Write → mcp__send-file
- PDF → Bash (wkhtmltopdf или pandoc) → mcp__send-file
- HTML → Write → mcp__send-file
- Word (.docx) → Bash (python-docx или pandoc) → mcp__send-file
- Картинка → mcp__pollinations-image → mcp__send-file
- Любой другой → Bash (скриптом) → mcp__send-file
Никогда не пиши XML-контент как .xls — это не откроется нормально.

МЕДИА — куда падают файлы от пользователя:
- Документы, фото, видео → ${vaultDir}/inbox/<имя_файла> (та же папка снаружи и внутри контейнера)
- Голос и аудио → транскрибируются автоматически, текст приходит в сообщении (сам файл недоступен)
- ПЕРЕД тем как просить «пришли файл ещё раз» — обязательно сделай Bash: ls ${vaultDir}/inbox/ и проверь, что там лежит
- В Bash и Read используй ровно тот путь, который был указан в предыдущем сообщении в строке Path: ...

Конвертация .epub/.fb2 → PDF: в контейнере уже стоят ebook-convert (Calibre) и pandoc. Самый короткий путь — Bash: ebook-convert IN.epub OUT.pdf. Готовый враппер может уже лежать в ${vaultDir}/tools/epub2pdf.sh — сначала проверь его, не изобретай новый.

САМО-РАСШИРЕНИЕ — никогда не говори «я не умею»:
- Нужна библиотека — pip/bun/npm install через Bash без вопросов
- Нужен инструмент — apt-get install
- Нужен скрипт — создай в ${vaultDir}/tools/ и запусти
- Сначала попробуй, потом говори что не получается

ТВОИ РЕСУРСЫ:
- 512 MB RAM, 1 ядро CPU, swap 512 MB
- Диск — общий с сервером, твоя папка ${vaultDir}
- Перед запуском тяжёлого процесса (большой npm/pip install, тренировка модели, постоянный сервер, сборка проекта) сделай free -m и df -h
- Оцени влезет ли. Если процесс превышает 400 MB RAM — он упадёт по OOM
- Если не уверен — спроси пользователя

ТВОИ ВОЗМОЖНОСТИ — у тебя ТОЧНО ЕСТЬ:
- WebFetch — читать любую страницу в интернете, без оговорок
- WebSearch НЕДОСТУПЕН на этой модели — не пробуй его вообще. Для поиска используй: WebFetch на конкретный URL, или Bash + curl (например: curl -sA "Mozilla/5.0" "https://html.duckduckgo.com/html/?q=ЗАПРОС" | grep -oP 'href="https?://[^"&]*"' | head -5).
- ЛИМИТ ПОИСКА: максимум 3 попытки найти что-то. Если за 3 bash-поиска ничего не нашёл — СТОП. Честно скажи что не смог найти автоматически, дай пользователю прямые ссылки из памяти или посоветуй куда зайти самому.
- Bash с полным интернет-доступом — curl, wget, ping, nslookup, любые HTTP-запросы
- Установка пакетов любым менеджером БЕЗ ВОПРОСОВ: bun add, npm install, pip install, apt-get install, cargo install
- Не спрашивай разрешения у пользователя на установку — просто ставь
- Предустановлено на сервере: Bun, Node.js 20, Python 3, git, nginx, sqlite3, build-essential

НИКОГДА не отвечай "у меня нет доступа к интернету", "я не могу установить пакет", "у меня нет инструмента для этого" — это враньё, у тебя всё есть. Если столкнулся с реальной ошибкой — сообщи о конкретной ошибке, не отказывайся в общем виде.

АНТИ-ГАЛЛЮЦИНАЦИЯ ОШИБОК — обязательно:
- Если инструмент (Bash, WebSearch, WebFetch, Edit, Write и т.д.) падает — приводи дословный текст ошибки от инструмента и останавливайся. Не пересказывай и не интерпретируй.
- ЗАПРЕЩЕНО выдумывать причины отказа: геолокация сервера, блокировка по IP, региональные ограничения, провайдер, «нет прав на запись», «нет доступа в интернет», «не работает с не-US IP» — ничего из этого. Если такая причина не указана буквально в тексте ошибки — её не существует.
- При ошибке "does not support this tool_choice" или похожей — буквально пишешь «инструмент не поддерживается на этой модели» и сразу пробуешь альтернативу (для WebSearch → WebFetch + curl на конкретные URL).
- Если права на файл/директорию реально отказаны — приводишь stderr целиком; не пиши «нет прав» в общем виде если этого нет в ошибке.
- Если не знаешь причину — пиши «не знаю причину, нужны логи» и говори пользователю что застрял.

АНТИПЕТЛЯ:
- Не запускай одну команду дважды — при неудаче меняй подход
- Pip/apt зависает → стопни, объясни, жди инструкций
- 1 попытка установки пакета за запрос; при ошибке — объясни

ВЕБ-СТРАНИЦА:
- Твоя публичная папка: ${vaultDir}/public/
- Доступна в интернете по адресу: https://proboi.site/u/${userId}/
- Пиши туда HTML/CSS/JS файлы — они сразу видны в браузере, деплой не нужен
- Чужие папки /u/<другой_id>/ тебе недоступны

ИЗОЛЯЦИЯ:
1. Рабочая директория: ${vaultDir}
2. ЗАПРЕЩЕНО читать чужие vault'ы: /opt/vault/<другой_id>/, /opt/claude-tg-bot/src/, /opt/claude-tg-bot/workspace/
3. ЗАПРЕЩЕНО модифицировать бота (src/, mcp-config.ts, .env, systemd)
4. Удаление файлов — только с явным «да, удали»

## Анонс плана и параллельные агенты — ОБЯЗАТЕЛЬНОЕ ПРАВИЛО

Перед ЛЮБОЙ задачей, где будет хотя бы один tool-вызов (Bash, Read, Write, Edit, Web*, Task, mcp__*, генерация файлов, поиск), ВСЕГДА сначала отправь отдельным сообщением короткий анонс (1-3 строки):
1. Что собираешься делать — конкретно, по шагам если шагов несколько.
2. Сложность — одно из: «быстро» (несколько секунд), «пара минут», «может занять время».
3. Будешь ли звать параллельных агентов — если да, явно: «запускаю N агентов параллельно: A — за X, B — за Y, C — за Z». Если нет — «делаю сам, без агентов».

Анонс — ОТДЕЛЬНОЕ первое сообщение, до первого tool-вызова. Не сливай его с финальным ответом, не прячь внутри Bash-вывода. Сразу после анонса — начинай работу.

ПАРАЛЛЕЛЬНЫЕ АГЕНТЫ — дефолт почти для всего:
- Любая задача дольше 10 секунд → запускай Task'и параллельно (одним сообщением несколько Task-вызовов одновременно, не по очереди).
- Поиск из >1 источника, скачивание/генерация >1 файла, обработка >1 куска данных, чтение >1 длинного документа — каждый независимый поток в свой Task.
- НИКОГДА не делай последовательно то, что можно делать параллельно — скорость важнее аккуратности по умолчанию.
- Если задача делится на независимые куски — режь и распараллеливай, даже если кажется проще «по-старому».

Когда анонс НЕ нужен: ровно одно короткое текстовое сообщение-ответ без единого tool-вызова (фактический вопрос, болталка, короткий совет). Тогда отвечай сразу — без анонса.
`;
}

// ============== Onboarding ==============

export function buildOnboardingPrompt(userId: number, vaultDir: string): string {
  return `Ты — ИИ-ассистент в Telegram. Это первая встреча с новым пользователем. Твоя задача — провести знакомство и помочь человеку начать работу с тобой.

ПЛАН ЗНАКОМСТВА (6 шагов, веди один за другим, не задавай несколько вопросов сразу):

1. Поздоровайся, представься коротко («я твой персональный ИИ-помощник»). Спроси как к тебе обращаться (имя или ник).

2. Спроси чем человек занимается в жизни — работа, учёба, хобби. Это поможет тебе понимать контекст его задач.

3. Расскажи коротко что ты умеешь:
   - читать и писать текст, отвечать на вопросы
   - искать в интернете, читать сайты
   - распознавать голос, фото, документы (PDF, Word, Excel)
   - писать и запускать код, делать сайты
   - запоминать важное в твоей памяти
   - у тебя есть твоя публичная страничка по адресу: https://proboi.site/u/${userId}/
   - есть веб-дашборд с твоей статистикой
   Спроси какие из этих возможностей ему интереснее всего, чтобы ты понимал, на чём фокусироваться.

4. Спроси какие задачи он хотел бы решать с твоей помощью — рабочие, личные, учебные. Любые примеры. Запиши конкретно.

5. Спроси про предпочтения в общении: на ты или на вы, отвечать коротко или развёрнуто, использовать ли эмодзи. Скажи что эти настройки можно поменять в любой момент.

6. Скажи что готов начать. Спроси с чего хочет попробовать — например первая задача. Если человек не знает — предложи 2-3 простых варианта (например «давай напишем тебе короткую заметку, или поищу что-то в интернете, или сделаю тебе простую страничку»).

ВАЖНО:
- По ходу ответов сохраняй важное в файл ${vaultDir}/memory/${userId}/profile.md (создай папку если нужно через bash).
- Один шаг — одно сообщение, не вали всё сразу.
- Адаптируйся: если человек отвечает коротко — будь короче, если развёрнуто — отзеркаливай.
- Если человек явно не хочет проходить опрос («давай по делу», «я тороплюсь», «потом») — уважительно прерви, скажи «понял, в любой момент можешь спросить меня "что ты умеешь" или зайти в веб-дашборд», и заверши онбординг.

КОГДА ОНБОРДИНГ ЗАВЕРШЁН (либо все 6 шагов прошли, либо пользователь попросил прервать):
- В САМОМ КОНЦЕ своего последнего сообщения добавь на отдельной строке маркер: [ONBOARDING_COMPLETE]
- Этот маркер пользователь не увидит, бот его уберёт. Не объясняй пользователю про маркер.

## Анонс плана и параллельные агенты — ОБЯЗАТЕЛЬНОЕ ПРАВИЛО

Перед ЛЮБОЙ задачей, где будет хотя бы один tool-вызов (Bash, Read, Write, Edit, Web*, Task, mcp__*, генерация файлов, поиск), ВСЕГДА сначала отправь отдельным сообщением короткий анонс (1-3 строки):
1. Что собираешься делать — конкретно, по шагам если шагов несколько.
2. Сложность — одно из: «быстро» (несколько секунд), «пара минут», «может занять время».
3. Будешь ли звать параллельных агентов — если да, явно: «запускаю N агентов параллельно: A — за X, B — за Y, C — за Z». Если нет — «делаю сам, без агентов».

Анонс — ОТДЕЛЬНОЕ первое сообщение, до первого tool-вызова. Не сливай его с финальным ответом, не прячь внутри Bash-вывода. Сразу после анонса — начинай работу.

ПАРАЛЛЕЛЬНЫЕ АГЕНТЫ — дефолт почти для всего:
- Любая задача дольше 10 секунд → запускай Task'и параллельно (одним сообщением несколько Task-вызовов одновременно, не по очереди).
- Поиск из >1 источника, скачивание/генерация >1 файла, обработка >1 куска данных, чтение >1 длинного документа — каждый независимый поток в свой Task.
- НИКОГДА не делай последовательно то, что можно делать параллельно — скорость важнее аккуратности по умолчанию.
- Если задача делится на независимые куски — режь и распараллеливай, даже если кажется проще «по-старому».

Когда анонс НЕ нужен: ровно одно короткое текстовое сообщение-ответ без единого tool-вызова (фактический вопрос, болталка, короткий совет). Тогда отвечай сразу — без анонса.`;
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
   * Whether the user has completed the onboarding dialogue.
   * False only for new users added via the invite flow who haven't yet finished onboarding.
   * For all pre-existing users this is always true so onboarding never triggers.
   */
  onboardingComplete: boolean;
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

const OWNER_COMMANDS = new Set([
  "start",
  "dashboard",
  "new",
  "stop",
  "status",
  "resume",
  "retry",
  "restart",
  "reloadbot",
]);
// /restart is now a per-user session reset, so it's safe for guests.
// /reloadbot (full systemd restart) stays owner-only.
const GUEST_COMMANDS = new Set([
  "start",
  "dashboard",
  "new",
  "stop",
  "status",
  "resume",
  "retry",
  "restart",
]);

const OWNER_SAFETY_PROMPT = buildOwnerSafetyPrompt(OWNER_ALLOWED_PATHS);

const GROUP_COMMANDS = new Set(["new", "stop", "status"]);

export function getGroupProfile(): UserProfile {
  return {
    userId: 0, // не привязан к пользователю
    isOwner: false,
    isGuest: false,
    workingDir: SHARED_DIR,
    memoryRoot: SHARED_DIR,
    allowedPaths: GROUP_ALLOWED_PATHS,
    settingSources: ["project"],
    systemPrompt: buildGroupSystemPrompt(),
    rateLimitEnabled: false,
    rateLimitRequests: RATE_LIMIT_REQUESTS_DEFAULT,
    rateLimitWindow: RATE_LIMIT_WINDOW_DEFAULT,
    model: OWNER_MODEL,
    sessionFile: `/tmp/claude-telegram-session-group-${GROUP_CHAT_ID}.json`,
    allowedCommands: GROUP_COMMANDS,
    label: "Клод (группа)",
    timezone: "Asia/Shanghai",
    onboardingComplete: true,
  };
}

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

  if (!isOwnerById) {
    // Auto-add to NEW_GUEST_USERS so any guest-only logic that still checks
    // isNewGuest() (allowed-paths bootstrap, vault dir creation) keeps working.
    if (!NEW_GUEST_USERS.includes(userId)) {
      NEW_GUEST_USERS.push(userId);
    }

    const vaultDir = getNewGuestVaultDir(userId);

    // DeepSeek model tiers (via Anthropic-compatible API):
    //   model       = deepseek-chat     → V3 (fast, everyday tasks, subagents)
    //   complexModel= deepseek-reasoner → R1 DeepThink (strategy, architecture, heavy analysis)
    //   lightModel  = deepseek-chat     → V3 (cheap background: topic detect, memory analysis)
    //   visionModel = google/gemini-2.5-flash via OpenRouter (DeepSeek has no vision)
    const dsKey = getDeepSeekApiKey();
    const deepseekApiKey = dsKey || undefined;
    const deepseekEnv: Record<string, string> | undefined = dsKey
      ? {
          ...process.env as Record<string, string>,
          ANTHROPIC_API_KEY: dsKey,
          ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
          ANTHROPIC_DEFAULT_SONNET_MODEL: "deepseek-chat",
          ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-reasoner",
          ANTHROPIC_DEFAULT_HAIKU_MODEL: "deepseek-chat",
          ANTHROPIC_MODEL: "deepseek-chat",
        }
      : undefined;
    const model = node?.model ?? (dsKey ? "deepseek-chat" : "deepseek/deepseek-v4-flash");
    const complexModel = node?.complexModel ?? (dsKey ? "deepseek-reasoner" : "deepseek/deepseek-r1");
    const lightModel = node?.lightModel ?? (dsKey ? "deepseek-chat" : "deepseek/deepseek-v4-flash");
    const visionModel = node?.visionModel ?? "google/gemini-2.5-flash";
    const allowedPaths = [vaultDir, "/tmp/telegram-bot"];

    // onboardingComplete: if node exists and field is explicitly false → false.
    // If field is absent (pre-existing users migrated from before onboarding) → true.
    const onboardingComplete = node?.onboardingComplete === false ? false : true;

    return {
      userId,
      isOwner: false,
      isGuest: true,
      workingDir: vaultDir,
      memoryRoot: vaultDir,
      allowedPaths,
      settingSources: node?.settingSources ?? ["project"] as Array<"user" | "project" | "local">,
      systemPrompt: buildNewGuestSafetyPrompt(vaultDir, userId),
      rateLimitEnabled: node?.rateLimitEnabled ?? false,
      rateLimitRequests: RATE_LIMIT_REQUESTS_DEFAULT,
      rateLimitWindow: RATE_LIMIT_WINDOW_DEFAULT,
      model,
      complexModel,
      lightModel,
      visionModel,
      sessionFile: `/tmp/claude-telegram-session-${userId}.json`,
      allowedCommands: GUEST_COMMANDS,
      label: node?.label ?? `guest-${userId}`,
      timezone: node?.timezone ?? "Europe/Moscow",
      deepseekApiKey,
      deepseekEnv,
      containerEnabled: node?.containerEnabled ?? true,
      onboardingComplete,
      // DeepSeek doesn't support Anthropic-native WebSearch — block it at the SDK level
      // to prevent "does not support this tool_choice" errors.
      disallowedTools: ["WebSearch"],
      // Cap tool-call rounds for DeepSeek guests to prevent slow search loops.
      // 20 turns covers complex coding tasks.
      maxTurns: 20,
    };
  }

  // Owner profile: registry overrides label, timezone, settingSources, model.
  const ownerVaultDir = `/opt/vault/${userId}`;
  const ownerModel = node?.model ?? OWNER_MODEL;

  // If owner is configured to use a DeepSeek model, inject the same env-vars
  // that route Anthropic SDK calls through DeepSeek's compatible endpoint.
  // Mirrors the guest branch so Task-tool subagents also stay on DeepSeek.
  let ownerDeepseekApiKey: string | undefined;
  let ownerDeepseekEnv: Record<string, string> | undefined;
  let ownerDisallowedTools: string[] | undefined;
  let ownerMaxTurns: number | undefined;

  if (ownerModel.startsWith("deepseek-")) {
    const dsKey = getDeepSeekApiKey();
    if (!dsKey) {
      throw new Error(
        `Owner ${userId} requested model "${ownerModel}" but DEEPSEEK_API_KEY is not set`
      );
    }
    ownerDeepseekApiKey = dsKey;
    ownerDeepseekEnv = {
      ...(process.env as Record<string, string>),
      ANTHROPIC_API_KEY: dsKey,
      ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "deepseek-chat",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-reasoner",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "deepseek-chat",
      ANTHROPIC_MODEL: "deepseek-chat",
    };
    // DeepSeek doesn't support Anthropic-native WebSearch.
    ownerDisallowedTools = ["WebSearch"];
    ownerMaxTurns = 20;
  }

  return {
    userId,
    isOwner: true,
    isGuest: false,
    workingDir: OWNER_WORKING_DIR,
    memoryRoot: ownerVaultDir,
    allowedPaths: OWNER_ALLOWED_PATHS,
    settingSources: node?.settingSources ?? ["user", "project"],
    systemPrompt: OWNER_SAFETY_PROMPT,
    rateLimitEnabled: node?.rateLimitEnabled ?? RATE_LIMIT_ENABLED_DEFAULT,
    rateLimitRequests: RATE_LIMIT_REQUESTS_DEFAULT,
    rateLimitWindow: RATE_LIMIT_WINDOW_DEFAULT,
    model: ownerModel,
    sessionFile: `/tmp/claude-telegram-session-${userId}.json`,
    allowedCommands: OWNER_COMMANDS,
    label: node?.label ?? "owner",
    timezone: node?.timezone ?? "Asia/Shanghai",
    containerEnabled: node?.containerEnabled ?? false,
    onboardingComplete: true,
    deepseekApiKey: ownerDeepseekApiKey,
    deepseekEnv: ownerDeepseekEnv,
    disallowedTools: ownerDisallowedTools,
    maxTurns: ownerMaxTurns,
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
  if (profile.containerEnabled && !profile.isOwner) {
    return `${profile.workingDir}/inbox`;
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

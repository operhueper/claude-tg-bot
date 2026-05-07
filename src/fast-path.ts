/**
 * Fast-path detection: determine if a message can be served directly via
 * DeepSeek Chat API, bypassing the Claude CLI subprocess and MCP overhead.
 *
 * The Claude CLI adds ~10-15s of startup per query (spawning Node, loading
 * MCP servers, handshake). For simple conversational messages that don't need
 * tools (Bash, Read, Write, Edit, MCP), we can call the DeepSeek API directly
 * and get a response in 0.5-2s.
 */

// ===================== Action-KEYWORDS =====================
// Messages containing these likely need tools → route through Claude CLI.

const TOOL_TRIGGERS: string[] = [
  // Russian action verbs
  "напиши", "напишите", "напишет",
  "создай", "создайте", "создашь", "создадите",
  "сделай", "сделайте", "сделаешь", "сделаете",
  "отредактируй", "отредактируйте",
  "исправь", "исправьте", "исправишь",
  "найди", "найдите", "найдёшь", "найдете",
  "поищи", "поищите",
  "запусти", "запустите", "запускай",
  "выполни", "выполните",
  "открой", "откройте", "откроешь",
  "прочитай", "прочитайте", "прочти",
  "удали", "удалите", "удалить",
  "сохрани", "сохраните",
  "покажи", "покажите", "покажешь",
  "сгенерируй", "сгенерируйте", "сгенерировать",
  "проверь", "проверьте",
  "сравни", "сравните",
  "установи", "установите", "установить",
  "загрузи", "загрузите", "загрузить",
  "скачай", "скачайте", "скачать",
  "отправь", "отправьте", "отправить",
  "проанализируй", "проанализируйте",
  "сформируй", "сформируйте",
  "подготовь", "подготовьте",
  "обнови", "обновите", "обновить",
  "добавь", "добавьте", "добавить",
  "распарсь", "распарьте",
  "переведи", "переведите",
  "построй", "постройте", "построить",
  "настрой", "настройте", "настроить",
  "скомпилируй",
  "разверни", "разверните",
  "упакуй", "упакуйте",
  "отформатируй",
  "переименуй", "переименуйте",

  // English action verbs
  "write", "create", "make ", "edit", "update", "fix ",
  "find", "search", "run ", "execute", "open ",
  "delete", "remove", "save ", "show ", "generate",
  "check", "compare", "install", "download", "upload",
  "send ", "analyze", "parse", "build", "compile",
  "init ", "start ", "stop ", "restart ",
  "rename", "format", "configure",

  // Tool/infra keywords
  "bash", "shell", "cmd ", "terminal",
  "код", "code", "script", "файл", "file ",
  "папк", "директори", "folder", "directory",
  "git ", "npm ", "pip ", "bun ", "docker",
  "команда", "command",
  "ssh", "curl", "wget", "rsync",
  "sudo",
  "установк", "install ",
  "докер", "docker",
  "контейнер", "container",
  "репозитори", "repository",
  "деплой", "deploy",
  "билд", "build",
  "конфиг", "config",
  "настройк", "settings",
];

const FILE_PATH_PATTERN = /\/(tmp|opt|root|home|var|etc|usr)\//;
const CODE_BLOCK_PATTERN = /```/;

// Quick patterns that are always simple (even if they contain keywords)
const SIMPLE_GREETINGS = [
  /^привет/i,
  /^здравствуй/i,
  /^здрасте/i,
  /^hello/i,
  /^hi\b/i,
  /^hey\b/i,
  /^ok\b/i,
  /^okay\b/i,
  /^yes\b/i,
  /^no\b/i,
  /^yep\b/i,
  /^nope\b/i,
  /^ага\b/i,
  /^да\b/i,
  /^нет\b/i,
  /^понял\b/i,
  /^поняла\b/i,
  /^ладно\b/i,
  /^хорошо\b/i,
  /^спасибо/i,
  /^спс\b/i,
  /^thanks/i,
  /^thx\b/i,
  /^пока\b/i,
  /^bye\b/i,
  /^как дела/i,
  /^чё как/i,
  /^how are/i,
  /^what'?s up/i,
  /^норм\b/i,
  /^отлично\b/i,
  /^супер\b/i,
  /^класс\b/i,
  /^круто\b/i,
  /^nice\b/i,
  /^great\b/i,
  /^good\b/i,
  /^lol\b/i,
  /^cool\b/i,
  /^ого\b/i,
  /^мм\b/i,
  /^mhm\b/i,
  /^угу\b/i,
];

/**
 * Determine whether a user message can be answered via the direct API fast path,
 * bypassing Claude CLI, MCP, and all tool infrastructure.
 *
 * Returns `true` if the message is purely conversational (no tool access needed).
 * Returns `false` if it likely requires Bash, Read/Write/Edit, MCP, or files.
 */
export function isSimpleQuery(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;

  // === Quick pattern match: short greetings/acknowledgments ===
  for (const pattern of SIMPLE_GREETINGS) {
    if (pattern.test(trimmed)) return true;
  }

  // === Length-based heuristic ===
  // Very short messages (< 100 chars) are likely simple by default
  if (trimmed.length < 100) {
    // But check for clear tool intent even in short messages
    const lower = trimmed.toLowerCase();
    for (const trigger of TOOL_TRIGGERS) {
      if (lower.includes(trigger)) return false;
    }
    if (FILE_PATH_PATTERN.test(trimmed)) return false;
    if (CODE_BLOCK_PATTERN.test(trimmed)) return false;
    return true;
  }

  // === Medium messages (100-200 chars) ===
  if (trimmed.length <= 200) {
    const lower = trimmed.toLowerCase();
    for (const trigger of TOOL_TRIGGERS) {
      if (lower.includes(trigger)) return false;
    }
    if (FILE_PATH_PATTERN.test(trimmed)) return false;
    if (CODE_BLOCK_PATTERN.test(trimmed)) return false;
    return true;
  }

  // === Long messages (> 200 chars) ===
  // Anything this long likely has enough context to need tools or is a complex
  // task. Route through Claude CLI for safety.
  return false;
}

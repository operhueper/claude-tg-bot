/**
 * Human-language descriptions of tool calls for the idle heartbeat context layer.
 *
 * The bot's IdleHeartbeat rotates random idle phrases while the model thinks.
 * When the model invokes a tool, we want to replace the random phrase with a
 * short, serious description of what's actually happening — without exposing
 * technical terms (file paths, command names, internal tool identifiers).
 *
 * Returns null for tools the user shouldn't be made aware of (e.g. TodoWrite
 * already has its own progress widget).
 */

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function countParallelTasks(input: Record<string, unknown>): number {
  const candidates = [input.tasks, input.subtasks, input.subagents, input.agents];
  for (const c of candidates) {
    if (Array.isArray(c)) return c.length;
  }
  return 0;
}

export function humanizeToolCall(
  toolName: string,
  input: Record<string, unknown>
): string | null {
  // TodoWrite has its own dedicated widget — don't duplicate the signal.
  if (toolName === "TodoWrite") return null;

  // Parallel agents — show count, no task descriptions
  if (toolName === "mcp__parallel__run" || toolName === "Task") {
    const n = countParallelTasks(input);
    if (n > 1) return `Запускаю ${n} помощников параллельно`;
    if (n === 1) return "Запускаю помощника";
    return "Запускаю помощников параллельно";
  }

  // File operations — generic, no file names
  if (toolName === "Read") return "Изучаю содержимое";
  if (toolName === "Edit" || toolName === "MultiEdit") return "Правлю файл";
  if (toolName === "Write") return "Записываю результат";
  if (toolName === "NotebookEdit") return "Правлю блокнот";
  if (toolName === "Glob") return "Ищу нужные файлы";
  if (toolName === "Grep") return "Ищу по содержимому";

  // Shell — generic
  if (toolName === "Bash" || toolName === "mcp__container__Bash") {
    return "Работаю в системе";
  }

  // Web
  if (toolName === "WebFetch") return "Открываю страницу";
  if (toolName === "WebSearch") {
    const q = nonEmptyString((input as { query?: unknown }).query);
    return q ? `Ищу в интернете: ${q.length > 40 ? q.slice(0, 37) + "…" : q}` : "Ищу в интернете";
  }

  // Image generation
  if (
    toolName.startsWith("mcp__pollinations") ||
    toolName.startsWith("mcp__openrouter-image")
  ) {
    return "Рисую картинку";
  }

  // File delivery / asking the user
  if (toolName.startsWith("mcp__send-file")) return "Готовлю файл";
  if (toolName.startsWith("mcp__ask-user")) return "Уточняю детали";
  if (toolName.startsWith("mcp__connect-google")) return "Подключаю Google";

  // Google Workspace (Composio)
  if (toolName.startsWith("mcp__google-workspace") || toolName.startsWith("GMAIL_")) {
    return "Работаю в Google";
  }
  if (toolName.startsWith("GOOGLEDOCS_")) return "Работаю с документом";
  if (toolName.startsWith("GOOGLEDRIVE_")) return "Работаю с диском";
  if (toolName.startsWith("GOOGLECALENDAR_")) return "Работаю с календарём";
  if (toolName.startsWith("GOOGLESHEETS_")) return "Работаю с таблицей";

  // Plan / control flow
  if (toolName === "ExitPlanMode") return "Готов начинать";
  if (toolName === "ScheduleWakeup") return "Ставлю напоминание";

  // Generic MCP fallback
  if (toolName.startsWith("mcp__")) return "Работаю над задачей";

  return null;
}

/**
 * Generic announcement used when the model started a tool call without writing
 * any plan first. Kept short, serious, and free of technical terms.
 */
export const FALLBACK_PLAN_ANNOUNCEMENT =
  "Сейчас разберусь, мне нужно несколько шагов.";

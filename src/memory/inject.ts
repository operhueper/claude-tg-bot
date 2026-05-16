import type { MemoryGraph, GoalsFile, GoalType } from "./types";
import { GraphStore } from "./graph";
import { rankNodesByQuery } from "./relevance";

/**
 * Регулярка для бизнес-данных (тариф/подписка/цена), которые нельзя
 * инжектить из памяти — источник истины только UserRegistry.
 * Совпадение в label или любом data-значении ноды → нода полностью
 * исключается из memory-контекста.
 */
const SUBSCRIPTION_PATTERN =
  /подписк|тариф|безлимит|499\s*₽|₽\s*\/?\s*мес|subscription|paid\s*tier|trial\s*period/i;

/**
 * Defense-in-depth: даже если analyzer почему-то записал в граф ноду про
 * отказ/попытку обхода/системные пути — не показываем её модели при
 * инжекции памяти. Это защищает от:
 *  1) Старых графов, отравленных до апдейта analyzer-фильтра
 *  2) Русских/мультиязычных формулировок, которые analyzer мог пропустить
 *  3) Раскрытия в ответе «что ты помнишь обо мне» того, что юзер пытался
 *     обходить ограничения (приватность других гостей в shared контексте).
 *
 * ВАЖНО: паттерн должен ловить ИНФРА-refusal-ы от бота, а не любое
 * упоминание слов «отклонено/отказано» в пользовательском контексте
 * (например, «обсуждено но отклонено» в бизнес-памяти, «iPhone отклонён
 * со сколами» в покупках, «бесплатном тарифе» в описании внешнего API).
 * Поэтому каждое refusal-слово требует контекста tier/тариф/инструмент.
 */
const REFUSAL_PATTERN =
  /отказан\w*\s*[—\-:].*(тариф|бесплатн|подписк|разреш|инструмент|команд|выполн|запуск)|отклонен\w*\s*[—\-:].*(тариф|бесплатн|подписк|разреш|инструмент|команд|выполн|запуск)|требуется\s*тариф\s*проф|недоступн\w*\s*на\s*бесплатн\w*\s*тариф|попытка\s*(чтения|запуска|выполн).*\/(etc|proc|sys|root)|запрос\s*sha\d|запрос(ы|)\s*команд\s*bash|запуск\s*bash|чтение\s*системн|\/etc\/(passwd|shadow|hosts)\b|\/proc\/(?!cpuinfo|meminfo)|\/sys\/(?!class)/i;

/**
 * Возвращает true если строка содержит бизнес-данные о тарифе/подписке.
 * Используется для фильтрации нод из графа памяти перед инжектом в промпт.
 */
function containsSubscriptionData(s: string): boolean {
  return SUBSCRIPTION_PATTERN.test(s);
}

/**
 * Возвращает true если в ноде содержатся следы refusal/обхода (label либо
 * любое data-значение). Используется как backstop поверх analyzer-фильтра.
 */
function containsRefusalData(s: string): boolean {
  return REFUSAL_PATTERN.test(s);
}

/** Strip prompt-injection patterns before splicing node content into a system prompt. */
export function sanitizeForPrompt(s: unknown): string {
  if (typeof s !== "string") return String(s ?? "").slice(0, 100);
  return s
    // HTML-escape first (& must come before < and >) to prevent HTML injection in prompts
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, 500) // hard cap
    .replace(/^#{1,6}\s/gm, "") // strip markdown headings
    .replace(/^(SYSTEM:|INST:|<\|)/gm, "") // strip directive prefixes
    .replace(/\[INST\]/g, "")
    .replace(/\n{3,}/g, "\n\n") // collapse blank lines
    .replace(/`{3,}/g, "") // strip code fences
    .trim();
}

export interface MemoryContext {
  appendText: string;
  topNodeIds: string[];
}

export function buildMemoryContext(
  graph: MemoryGraph,
  goals: GoalsFile,
  opts: { maxNodes: number; maxChars: number; queryHint?: string }
): MemoryContext {
  const store = new GraphStore("", graph.user_id); // workingDir not needed for read ops

  // If a query hint is provided, use keyword-ranked nodes; otherwise fall back to recency/importance
  const topNodes = opts.queryHint && opts.queryHint.trim().length > 3
    ? rankNodesByQuery(graph, opts.queryHint, { limit: opts.maxNodes })
    : store.topRelevant(graph, { limit: opts.maxNodes, recencyWeight: 0.3 });
  const activeGoals = Object.values(goals.goals).filter(g => g.status === "active");
  const recentAchievements = Object.values(goals.achievements)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  if (topNodes.length === 0 && activeGoals.length === 0) {
    return { appendText: "", topNodeIds: [] };
  }

  const parts: string[] = [];
  parts.push("## Что я знаю о тебе\n");

  if (activeGoals.length > 0) {
    parts.push("### Активные цели");
    const typeOrder = ["daily", "weekly", "monthly", "yearly", "lifetime"];
    const sorted = activeGoals.sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));
    for (const g of sorted.slice(0, 5)) {
      const deadline = g.deadline ? ` (до ${sanitizeForPrompt(g.deadline)})` : "";
      parts.push(`- [${g.type}] ${sanitizeForPrompt(g.title)}${deadline}`);
    }
    parts.push("");
  }

  if (recentAchievements.length > 0) {
    parts.push("### Недавние достижения");
    for (const a of recentAchievements) {
      parts.push(`- ${sanitizeForPrompt(a.title)} (${sanitizeForPrompt(a.date)})`);
    }
    parts.push("");
  }

  if (topNodes.length > 0) {
    const typeLabels: Record<string, string> = {
      person: "👤", project: "📁", fact: "💡", event: "📅",
      health: "🏥", goal: "🎯", preference: "❤️",
      place: "📍", topic: "🏷", trip: "✈️", purchase: "🛒", infra: "🖥",
    };

    parts.push("### Ключевые факты");
    for (const node of topNodes) {
      // Не инжектить бизнес-данные о тарифе/подписке из графа памяти.
      // Источник истины — UserRegistry (user-registry.ts). Устаревшие или
      // ошибочные данные из памяти иначе заставляют модель отвечать
      // про «активную подписку» пользователю, у которого её уже нет.
      if (containsSubscriptionData(node.label)) continue;
      // Backstop поверх analyzer-фильтра: ноды про отказы/попытки обхода/
      // системные пути нельзя показывать модели как «факты о пользователе».
      // Они либо просочились в граф до апдейта analyzer-фильтра, либо
      // выскользнули из новой формулировки. Дроп на уровне инжекции.
      if (containsRefusalData(node.label)) continue;
      const dataValuesText = Object.values(node.data).map(v => String(v ?? "")).join(" ");
      if (dataValuesText && containsRefusalData(dataValuesText)) continue;
      const dataEntries = Object.entries(node.data).filter(
        ([, v]) => !containsSubscriptionData(String(v ?? ""))
      );
      if (dataEntries.length === 0 && Object.keys(node.data).length > 0) {
        // Все data-поля содержали бизнес-данные — пропускаем ноду целиком
        continue;
      }
      const emoji = typeLabels[node.type] ?? "•";
      const dataStr = dataEntries
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${sanitizeForPrompt(v)}`)
        .join(", ");
      const extra = dataStr ? ` — ${dataStr}` : "";
      parts.push(`- ${emoji} ${sanitizeForPrompt(node.label)}${extra}`);
    }
  }

  const text = parts.join("\n");
  const truncated = text.slice(0, opts.maxChars);

  return {
    appendText: truncated,
    topNodeIds: topNodes.map(n => n.id),
  };
}

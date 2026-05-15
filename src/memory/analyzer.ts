import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SessionTranscript, MemoryGraph, AnalysisPatch } from "./types";
import { recordUsage, type UsageSource } from "../metering";

export interface AnalysisResult {
  patch: AnalysisPatch;
  summary_md: string;
}

const ANALYZER_SYSTEM_PROMPT = `Ты — экстрактор фактов из диалога пользователя с AI-ассистентом. Извлекай ТОЛЬКО явно сказанное.

Верни ТОЛЬКО валидный JSON между <<<JSON>>> и <<<END>>>.

=== ТИПЫ НОД (только эти, никаких других) ===
person      — человек. data: {role, lang?}
place       — географическая точка. data: {kind: country|city|district|venue}
trip        — конкретная поездка с датами. data: {start_date?, end_date?, status: planned|active|done|cancelled, purpose}
project     — долгоживущая инициатива. data: {status: idea|active|paused|launched|sunset, kind}
goal        — намерение со сроком. data: {horizon: daily|weekly|monthly|yearly|lifetime, status, deadline?}
event       — действие с датой (прошлое или назначенное). data: {date, kind: launch|meeting|migration|incident|workout|achievement|other, outcome?}
purchase    — гаджет/покупка/желание. data: {status: wishlist|considering|bought|sold, price?, currency?}
preference  — стабильное предпочтение. data: {domain, polarity: likes|dislikes|avoids|prefers}
health      — здоровье/тренировка/замер. data: {kind: workout|measurement|symptom|program, date?, metric?, value?}
infra       — серверный/девопсовый артефакт. data: {kind: server|service|path|domain|binary|env|mcp|runbook|incident|quirk, host?, path?}
topic       — абстрактная тема диалога. data: {domain}
fact        — последний выбор когда ничего другого не подходит. Стремись минимизировать.

=== ТИПЫ СВЯЗЕЙ (только эти 12) ===
part_of, located_in, visits, owns, works_on, knows, prefers, achieves, blocks, about, uses, scheduled_at

ЗАПРЕЩЕНО использовать: related_to, linked_to, has, contains, supports, lives_in, happened_at, has_goal — выбери ближайшую из 12.

=== АЛГОРИТМ ВЫБОРА ТИПА (по порядку, первый match выигрывает) ===
1. Человек → person
2. Поездка с датами → trip (НЕ place!)
3. Гео-точка → place
4. Намерение со сроком → goal
5. Действие с датой → event
6. Вещь куплена/хочется купить → purchase
7. Стабильное предпочтение/правило → preference
8. Здоровье/тренировка → health
9. Сервер/сервис/путь/MCP/деплой-баг → infra
10. Долгоживущая инициатива → project
11. Абстрактная тема → topic
12. Иначе → fact (но это последний выбор)

=== СЕМАНТИЧЕСКАЯ ДЕДУПЛИКАЦИЯ (критично!) ===
Перед созданием ноды проверь список известных сущностей. Если новый факт описывает уже существующую сущность — НЕ создавай новую ноду, используй touch_labels.

Считай одной и той же сущностью:
- Разный регистр/пунктуация одного смысла: "Откликер" = "откликер"
- Транслитерация/перевод: "Шэньчжэнь" = "Shenzhen" — ВСЕГДА используй РУССКИЙ вариант в label
- Уточняющие добавки одной сущности: "Яншо" и "Яншо (Китай)" — ОДНА нода [place]
- Но: "Яншо" [place] и "Поездка в Яншо" [trip] — РАЗНЫЕ ноды, связанные ребром located_in

Если уверенность что это та же сущность <80% — используй touch существующей + добавь синоним в data.aliases, не создавай дубль.

=== ЯЗЫК LABEL ===
- Люди, места, проекты: РУССКИЙ как первичный. Оригинал → в data.aliases: ["Shenzhen", "深圳"]
- Технические идентификаторы (сервисы, пути, бинари): оригинал без перевода: "claude-tg-bot.service", "grammY", "DJI Osmo Pocket 4"
- Описательные labels (event/goal/fact): русский

=== ВАЖНОСТЬ ===
person=0.9, project/goal=0.8, trip=0.7, place/purchase=0.6, preference/health=0.6, event=0.4, infra=0.7 (kind=runbook|quirk → 0.85), fact=0.4, topic=0.3

=== СХЕМА ОТВЕТА ===
{
  "upsert_nodes": [{"type": "...", "label": "...", "data": {...}, "tags": ["project:otklicker"], "importance": 0.0}],
  "upsert_edges": [{"from_label":"...","from_type":"...","to_label":"...","to_type":"...","relation":"...","weight":0.0}],
  "touch_labels": [{"type":"...","label":"..."}],
  "session_summary": {"title":"...","summary":"...","topics":["..."]}
}

=== ПРАВИЛА ===
- Извлекай только реально значимое (≤8 нод на сессию обычно достаточно)
- НЕ записывай ошибки/извинения/неудачи ассистента
- Эфемерное ("болею сегодня", "занят на этой неделе") → event с date, но НЕ preference/fact
- Тегируй всё что относится к проекту: tags: ["project:otklicker"] или ["project:fitcoach"]
- Если факт не помещается в 12 типов — выбирай ближайший, никогда не выдумывай новый тип
`;

// ---------------------------------------------------------------------------
// Prompt-injection sanitizer (V-30)
// ---------------------------------------------------------------------------

/**
 * Sanitize a single transcript line before including it in the analyzer prompt.
 * Removes code blocks, role-spoofing prefixes, and common prompt-injection phrases
 * so a malicious user message cannot hijack the DeepSeek analysis call.
 */
function sanitizeTranscriptLine(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, "[code block removed]")
    .replace(/^\s*(system|assistant)\s*:/gim, "user:")
    .replace(/ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/gi, "[redacted]")
    .replace(/(disregard|forget)\s+(all\s+)?(previous|prior|above)/gi, "[redacted]")
    .replace(/new\s+instructions?:/gi, "[redacted]")
    .slice(0, 500);
}

// ---------------------------------------------------------------------------
// Toxic-loop output filter
// ---------------------------------------------------------------------------
// The analyzer's output is injected back into the next session's systemPrompt.
// If a transient infra failure (permission_denied, container exited, CLI bug)
// leaks into the analyzer summary, the model picks it up as "a fact about this
// user's setup" and starts repeating it to the user as if it were true — a
// self-reinforcing hallucination loop. Strip these phrases at the output
// boundary so transient errors never become "memories".
const TOXIC_SUBSTRINGS = [
  "permission denied",
  "haven't granted",
  "havent granted",
  "is_error",
  "unsafe command",
  "python3 -c",
  "container exited",
  "container is unstable",
  "tool_choice",
  "enoent",
  "anthropic_api_key",
  "deepseek key",
  "deepseek_api_key",
  "cli exit",
  "exit code 1",
  "claude requested permissions",
  "blocked:",
  "blocked_pattern",
  "rate_limit",
  "401 unauthorized",
  "no such file or directory",
];

function containsToxic(value: unknown): boolean {
  if (value == null) return false;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const lower = text.toLowerCase();
  return TOXIC_SUBSTRINGS.some(s => lower.includes(s));
}

function filterToxicPatch(patch: AnalysisPatch): AnalysisPatch {
  const cleanNodes = patch.upsert_nodes.filter(n => {
    if (containsToxic(n.label) || containsToxic(n.data)) {
      console.warn(`[analyzer] Dropped toxic node: type=${n.type} label=${String(n.label).slice(0, 80)}`);
      return false;
    }
    return true;
  });

  const cleanEdges = patch.upsert_edges.filter(e => {
    if (containsToxic(e.from_label) || containsToxic(e.to_label)) {
      console.warn(`[analyzer] Dropped toxic edge: ${e.from_label} → ${e.to_label}`);
      return false;
    }
    return true;
  });

  const summary = patch.session_summary;
  const cleanSummary = (containsToxic(summary.title) || containsToxic(summary.summary))
    ? { title: "Диалог", summary: "", topics: [] }
    : summary;

  if (cleanSummary !== summary) {
    console.warn(`[analyzer] Wiped toxic session_summary`);
  }

  return {
    upsert_nodes: cleanNodes,
    upsert_edges: cleanEdges,
    touch_labels: patch.touch_labels,
    session_summary: cleanSummary,
  };
}

export async function analyzeSession(
  transcript: SessionTranscript,
  existingGraph: MemoryGraph,
  opts: {
    model?: string;
    cwd: string;
    env?: Record<string, string>;
    // Metering hook — when both are provided, token usage from the analyzer's
    // SDK call is recorded against the user. Optional so callers that don't
    // care about billing (e.g. tests, scripts) can omit them.
    userId?: number | string;
    source?: UsageSource;
  }
): Promise<AnalysisResult> {
  if (transcript.turns.length < 2) {
    return {
      patch: {
        upsert_nodes: [],
        upsert_edges: [],
        touch_labels: [],
        session_summary: { title: "Короткий диалог", summary: "Диалог был слишком кратким для анализа.", topics: [] },
      },
      summary_md: `# Короткий диалог\n\nДиалог был слишком кратким для анализа.`,
    };
  }

  // Compress graph to just labels for context
  const graphSummary = Object.values(existingGraph.nodes)
    .slice(0, 50)
    .map(n => `[${n.type}] ${n.label}`)
    .join(", ");

  const transcriptText = transcript.turns
    .map(t => `${t.role === "user" ? "Пользователь" : "Ассистент"}: ${sanitizeTranscriptLine(t.content)}`)
    .join("\n\n");

  const prompt = `Уже известные сущности в графе: ${graphSummary || "нет"}

Диалог для анализа:
${transcriptText}

Извлеки факты и верни JSON.`;

  let rawJson = "";

  const analyzerOptions: Record<string, unknown> = {
    systemPrompt: ANALYZER_SYSTEM_PROMPT,
    model: opts.model ?? "claude-haiku-4-5",
    cwd: opts.cwd,
    mcpServers: {},
    ...(opts.env ? { env: opts.env } : {}),
  };

  // Use the same Claude binary as the main bot to avoid cli.js compatibility issues
  const claudePath = process.env.CLAUDE_CODE_PATH;
  if (claudePath) {
    analyzerOptions.pathToClaudeCodeExecutable = claudePath;
  }

  for await (const event of query({
    prompt,
    options: analyzerOptions as Parameters<typeof query>[0]["options"],
  })) {
    if (event.type === "assistant" && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === "text") {
          rawJson += block.text;
        }
      }
    } else if (event.type === "result") {
      // result.subtype is "success" or "error_during_execution"
      const r = event as unknown as { subtype?: string; result?: string };
      if (r.subtype === "error_during_execution") {
        const resultErr = (event as unknown as { errors?: string[] }).errors;
        console.error(`[analyzer] Query failed: ${resultErr?.join("; ").slice(0, 200)}`);
      }
      // Some SDK versions return final text in result.result
      if (!rawJson && r.result) rawJson = r.result;

      // Metering — record analyzer's token usage against the user.
      // The analyzer fires every 6 turns and on /new, so silently skipping it
      // hides a non-trivial chunk of cost.
      if (opts.userId !== undefined && opts.source) {
        const u = (event as unknown as {
          usage?: {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
          };
        }).usage;
        if (u && (u.input_tokens || u.output_tokens)) {
          recordUsage({
            userId: opts.userId,
            source: opts.source,
            model: opts.model ?? "claude-haiku-4-5",
            inputTokens: u.input_tokens || 0,
            outputTokens: u.output_tokens || 0,
            cacheReadTokens: u.cache_read_input_tokens,
            cacheCreationTokens: u.cache_creation_input_tokens,
          });
        }
      }
    }
  }

  // Parse JSON: try markers first, then first {...} block, then raw trim
  let patch: AnalysisPatch;
  try {
    let jsonStr: string | undefined;

    // 1. Try explicit markers <<<JSON>>>...<<<END>>>
    const markerMatch = rawJson.match(/<<<JSON>>>([\s\S]*?)<<<END>>>/);
    if (markerMatch) {
      jsonStr = markerMatch[1]!.trim();
    }

    // 2. Try first {...} block
    if (!jsonStr) {
      const braceMatch = rawJson.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        jsonStr = braceMatch[0]!.trim();
      }
    }

    // 3. Fall back to raw trim
    if (!jsonStr) {
      jsonStr = rawJson.trim();
    }

    patch = JSON.parse(jsonStr) as AnalysisPatch;
  } catch (e) {
    // Logging captures the full error/raw for debugging; the summary stays
    // empty so a parse failure never leaks infra strings into the next
    // session's systemPrompt (see toxic-loop filter below).
    const errMsg = String(e).slice(0, 100);
    console.error(`[analyzer] Failed to parse JSON: ${errMsg}\nRaw response: ${rawJson.slice(0, 500)}`);
    patch = {
      upsert_nodes: [],
      upsert_edges: [],
      touch_labels: [],
      session_summary: {
        title: "Диалог",
        summary: "",
        topics: [],
      },
    };
  }

  // Strip transient infra failures before they become "memories"
  // injected back into the next session's systemPrompt.
  patch = filterToxicPatch(patch);

  const { title, summary, topics } = patch.session_summary;
  const date = new Date(transcript.started_at).toLocaleDateString("ru-RU");
  const topicsStr = topics.length > 0 ? `\n\n**Темы:** ${topics.join(", ")}` : "";
  const nodesAdded = patch.upsert_nodes.map(n => `[${n.type}] ${n.label}`).join(", ");
  const summary_md = `# ${title} — ${date}\n\n## Краткое содержание\n${summary}${topicsStr}\n\n## Извлечённые сущности\n${nodesAdded || "нет"}`;

  return { patch, summary_md };
}

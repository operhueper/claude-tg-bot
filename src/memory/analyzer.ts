import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SessionTranscript, MemoryGraph, AnalysisPatch } from "./types";

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

export async function analyzeSession(
  transcript: SessionTranscript,
  existingGraph: MemoryGraph,
  opts: { model?: string; cwd: string; env?: Record<string, string> }
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
    .map(t => `${t.role === "user" ? "Пользователь" : "Ассистент"}: ${t.content.slice(0, 500)}`)
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
    const errMsg = String(e).slice(0, 100);
    const rawPreview = rawJson.slice(0, 500);
    console.error(`[analyzer] Failed to parse JSON: ${errMsg}\nRaw response: ${rawPreview}`);
    patch = {
      upsert_nodes: [],
      upsert_edges: [],
      touch_labels: [],
      session_summary: {
        title: "Диалог",
        summary: `Парсинг не удался: ${errMsg}. Raw response (первые 500 символов): ${rawPreview}`,
        topics: [],
      },
    };
  }

  const { title, summary, topics } = patch.session_summary;
  const date = new Date(transcript.started_at).toLocaleDateString("ru-RU");
  const topicsStr = topics.length > 0 ? `\n\n**Темы:** ${topics.join(", ")}` : "";
  const nodesAdded = patch.upsert_nodes.map(n => `[${n.type}] ${n.label}`).join(", ");
  const summary_md = `# ${title} — ${date}\n\n## Краткое содержание\n${summary}${topicsStr}\n\n## Извлечённые сущности\n${nodesAdded || "нет"}`;

  return { patch, summary_md };
}

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SessionTranscript, MemoryGraph, AnalysisPatch } from "./types";

export interface AnalysisResult {
  patch: AnalysisPatch;
  summary_md: string;
}

const ANALYZER_SYSTEM_PROMPT = `Ты — экстрактор фактов из диалога. Твоя задача: проанализировать переписку пользователя с AI-ассистентом и извлечь структурированные факты.

ВАЖНО: Извлекай ТОЛЬКО то, что явно упомянуто в диалоге. Не додумывай и не предполагай.

Верни ТОЛЬКО валидный JSON между маркерами <<<JSON>>> и <<<END>>>, без какого-либо другого текста.

Схема JSON:
{
  "upsert_nodes": [
    { "type": "person|project|fact|event|health|goal|achievement|preference|place|topic|infra|incident|runbook_step|deploy_quirk", "label": "...", "data": {}, "tags": [], "importance": 0.0-1.0 }
  ],
  "upsert_edges": [
    { "from_label": "...", "from_type": "...", "to_label": "...", "to_type": "...", "relation": "knows|works_on|likes|dislikes|owns|part_of|related_to|happened_at|linked_to|achieves|blocks|supports", "weight": 0.0-1.0 }
  ],
  "touch_labels": [
    { "type": "...", "label": "..." }
  ],
  "session_summary": {
    "title": "Краткий заголовок (до 60 символов)",
    "summary": "3-5 предложений о чём был диалог",
    "topics": ["тема1", "тема2"]
  }
}

Правила:
- importance: 0.9 для имён людей, 0.8 для проектов/целей, 0.5 для фактов/предпочтений, 0.3 для разовых событий
- importance для инфра-типов: infra=0.8, runbook_step=0.9 (ценное переиспользуемое знание), incident=0.7, deploy_quirk=0.85
- Минимум нод: только реально значимые факты
- label всегда на том языке, на котором упомянуто (обычно русский)
- Если диалог технический/о боте — topic node "разработка бота"

Когда извлекать инфра-факты (типы infra/incident/runbook_step/deploy_quirk):
- Упоминания серверов, сервисов, доменов, БД → infra. Пример: «прод на Hetzner называется jinru», «сервис claude-tg-bot.service на порту 3000»
- Конкретные сбои с датой или симптомом → incident. Пример: «бот падает с EOF когда bun install перезаписывает бинарь», «после обновления SDK subprocess выходит с кодом 1»
- Рецепты фикса, которые нужно повторять → runbook_step. Пример: «после bun install нужно копировать SDK бинарь из /root/.local/share/claude/versions/X», «Restart=always критично для /restart», «для перезапуска бота попросить юзера прислать /restart, а не дёргать systemctl»
- Нетривиальные особенности деплоя/окружения → deploy_quirk. Пример: «bun резолвит musl-linked бинарь, но Ubuntu использует glibc», «nginx location должен быть ^~ /ksyusha иначе regex перехватывает картинки»

Пример извлечения инфра-факта из диалога:
Если пользователь говорит «на проде после bun install ломается musl/glibc, надо подменить SDK бинарь» — это runbook_step с label «Recovery from musl/glibc trap after bun install» и data полями command/steps, плюс incident с label «musl/glibc несовместимость после bun install» и data.symptom.
`;

export async function analyzeSession(
  transcript: SessionTranscript,
  existingGraph: MemoryGraph,
  opts: { model?: string; cwd: string }
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

  for await (const event of query({
    prompt,
    options: {
      systemPrompt: ANALYZER_SYSTEM_PROMPT,
      model: opts.model ?? "claude-haiku-4-5",
      cwd: opts.cwd,
      mcpServers: {},
      maxThinkingTokens: 0,
    },
  })) {
    if (event.type === "assistant" && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === "text") {
          rawJson += block.text;
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

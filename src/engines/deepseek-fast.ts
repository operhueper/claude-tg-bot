/**
 * DeepSeek Fast Path — прямой REST-вызов DeepSeek Chat API в обход Claude CLI.
 *
 * Используется для простых разговорных запросов, не требующих инструментов
 * (Bash, Read/Write/Edit, MCP). Экономит ~10-15 сек на старте Claude CLI
 * с загрузкой MCP-серверов.
 *
 * Формат: OpenAI-compatible /chat/completions (streaming).
 */

import { STREAMING_THROTTLE_MS } from "../config";
import type { StatusCallback } from "../types";
import { recordUsage } from "../metering";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1/chat/completions";

/**
 * Системный промпт для быстрого режима — без упоминаний инструментов,
 * чтобы модель не пыталась их вызывать или жаловаться на их отсутствие.
 */
const FAST_PATH_SYSTEM_PROMPT = `Ты — полезный ИИ-ассистент в Telegram. Отвечай кратко и по делу.

ВАЖНО: Сейчас ты в быстром режиме — у тебя нет доступа к файлам, bash, коду или интернету.
Если запрос требует этих возможностей (написать/прочитать файл, запустить код, поискать в интернете, установить пакет) — честно скажи что задача требует полного режима и предложи повторить запрос — он уйдёт в полный режим со всеми инструментами.

В остальном — отвечай как обычный ассистент: дружелюбно, полезно, по-русски.`;

/**
 * Интерфейс истории сообщений для быстрого пути.
 */
interface FastPathMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Прямой вызов DeepSeek Chat API (streaming).
 *
 * @param systemPrompt — системный промпт (если не указан, используется дефолтный)
 * @param userMessage — текущее сообщение пользователя
 * @param history — предыдущие N сообщений из сессии (опционально)
 * @param apiKey — DeepSeek API ключ
 * @param statusCallback — колбэк для стриминга
 * @returns полный текст ответа
 */
export async function queryDeepSeekFast(
  systemPrompt: string | null,
  userMessage: string,
  history: FastPathMessage[],
  apiKey: string,
  statusCallback: StatusCallback,
  userId: number = 0,
): Promise<string> {
  // Build messages array
  const messages: FastPathMessage[] = [];

  // System prompt: use caller's or our default
  const effectiveSystemPrompt = systemPrompt ?? FAST_PATH_SYSTEM_PROMPT;
  messages.push({ role: "system", content: effectiveSystemPrompt });

  // Conversation history (last ~6 turns, skipping system prompts)
  for (const msg of history) {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push(msg);
    }
  }

  // Current user message
  messages.push({ role: "user", content: userMessage });

  const body = {
    model: "deepseek-chat",
    messages,
    stream: true,
    max_tokens: 4096,
    temperature: 0.7,
  };

  const resp = await fetch(DEEPSEEK_BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok || !resp.body) {
    const errText = await resp.text().catch(() => "unknown error");
    throw new Error(`DeepSeek API error ${resp.status}: ${errText}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";
  let lastUpdate = Date.now();
  let promptTokens = 0;
  let completionTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;

      try {
        const chunk = JSON.parse(data);
        const delta = chunk.choices?.[0]?.delta;
        const finishReason = chunk.choices?.[0]?.finish_reason;

        // Text delta
        if (delta?.content) {
          fullText += delta.content;
          const now = Date.now();
          if (now - lastUpdate > STREAMING_THROTTLE_MS) {
            await statusCallback("text", fullText, 0);
            lastUpdate = now;
          }
        }

        // Usage info (usually in last chunk)
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens || 0;
          completionTokens = chunk.usage.completion_tokens || 0;
        }

        // Finish
        if (finishReason === "stop" || finishReason === "length") {
          break;
        }
      } catch {
        // Skip malformed JSON chunks
      }
    }
  }

  // Send final text segment
  if (fullText) {
    await statusCallback("segment_end", fullText, 0);
  }

  // Record metering
  if (promptTokens > 0 || completionTokens > 0) {
    recordUsage({
      userId,
      source: "bot-deepseek",
      model: "deepseek-chat",
      inputTokens: promptTokens,
      outputTokens: completionTokens,
    });
  }

  return fullText || "Нет ответа от модели.";
}

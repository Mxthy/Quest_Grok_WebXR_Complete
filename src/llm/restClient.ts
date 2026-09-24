import type { LlmClientConfig, LlmReply } from "@/llm/types";
import { contextToMessages, type GameSnapshotForLlm } from "@/llm/contextBuilder";
import { buildLlmContext } from "@/llm/contextBuilder";

function parseReplyJson(content: string): LlmReply {
  const trimmed = content.trim();
  // extract JSON object if model wrapped in markdown
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const slice = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  try {
    const j = JSON.parse(slice) as {
      text?: string;
      expression?: string;
      choices?: LlmReply["choices"];
      effects?: LlmReply["effects"];
      speak?: boolean;
    };
    return {
      speaker: "Vivi",
      text: j.text?.trim() || trimmed.slice(0, 280),
      expression: j.expression,
      choices: j.choices?.slice(0, 3),
      effects: j.effects,
      speak: j.speak !== false,
      raw: j,
    };
  } catch {
    return {
      speaker: "Vivi",
      text: trimmed.slice(0, 280) || "…",
      expression: "neutral",
      choices: [
        { id: "ok", label: "Continue", effect: "none" },
        { id: "talk", label: "Talk more", effect: "none" },
      ],
      speak: true,
    };
  }
}

export type StreamHandlers = {
  onToken?: (partial: string) => void;
  signal?: AbortSignal;
};

/**
 * OpenAI-compatible Chat Completions (works with OpenAI, many proxies, local servers).
 * Streaming reduces time-to-first-token.
 */
export async function chatCompletion(
  config: LlmClientConfig,
  snap: GameSnapshotForLlm,
  handlers?: StreamHandlers,
): Promise<LlmReply> {
  const ctx = buildLlmContext(snap);
  const messages = contextToMessages(ctx, config.voiceStyle);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const body = {
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    stream: config.stream,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const signal = handlers?.signal
    ? AbortSignal.any([handlers.signal, controller.signal])
    : controller.signal;

  try {
    const res = await fetch(config.apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`LLM HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    if (config.stream && res.body) {
      const text = await readSseContent(res, handlers?.onToken);
      return parseReplyJson(text);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    return parseReplyJson(content);
  } finally {
    clearTimeout(timer);
  }
}

async function readSseContent(
  res: Response,
  onToken?: (partial: string) => void,
): Promise<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let full = "";
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith("data:")) continue;
      const payload = s.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload) as {
          choices?: { delta?: { content?: string }; message?: { content?: string } }[];
        };
        const piece =
          j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? "";
        if (piece) {
          full += piece;
          onToken?.(full);
        }
      } catch {
        /* ignore non-json sse */
      }
    }
  }
  return full;
}

export function isLlmConfigured(config: LlmClientConfig): boolean {
  // Key optional for local proxies; URL required
  return Boolean(config.apiUrl);
}

import { LlmError, type FetchLike, type LlmProvider, type LlmRequest } from "./types";

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

/** Works with any OpenAI-style chat endpoint: Groq, Ollama, OpenRouter, etc. */
export function openAiCompatibleProvider(opts: {
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  fetch?: FetchLike;
}): LlmProvider {
  const doFetch = opts.fetch ?? fetch;
  const url = `${opts.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  return {
    name: opts.name,
    model: opts.model,
    async generate(req: LlmRequest) {
      const res = await doFetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: opts.model,
          temperature: req.temperature ?? 0.8,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.prompt },
          ],
          ...(req.json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as ChatResponse;
      if (!res.ok) {
        throw new LlmError(`${opts.name} ${res.status}: ${body.error?.message ?? res.statusText}`, opts.name, res.status);
      }
      const text = body.choices?.[0]?.message?.content ?? "";
      if (!text) throw new LlmError(`${opts.name} returned an empty response`, opts.name);
      return { text, provider: opts.name, model: opts.model };
    },
  };
}

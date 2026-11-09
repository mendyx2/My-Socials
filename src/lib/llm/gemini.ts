import { LlmError, type FetchLike, type LlmProvider, type LlmRequest } from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

export function geminiProvider(opts: { apiKey: string; model: string; fetch?: FetchLike }): LlmProvider {
  const doFetch = opts.fetch ?? fetch;
  return {
    name: "gemini",
    model: opts.model,
    async generate(req: LlmRequest) {
      const res = await doFetch(`${BASE}/models/${encodeURIComponent(opts.model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: "user", parts: [{ text: req.prompt }] }],
          generationConfig: {
            temperature: req.temperature ?? 0.8,
            ...(req.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as GeminiResponse;
      if (!res.ok) {
        throw new LlmError(`Gemini ${res.status}: ${body.error?.message ?? res.statusText}`, "gemini", res.status);
      }
      if (body.promptFeedback?.blockReason) {
        throw new LlmError(`Gemini blocked the prompt: ${body.promptFeedback.blockReason}`, "gemini");
      }
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) throw new LlmError("Gemini returned an empty response", "gemini");
      return { text, provider: "gemini", model: opts.model };
    },
  };
}

/** Lists models this key can call with generateContent. Used by `npm run models`. */
export async function listGeminiModels(apiKey: string, doFetch: FetchLike = fetch): Promise<string[]> {
  const names: string[] = [];
  let pageToken = "";
  do {
    const url = `${BASE}/models?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await doFetch(url, { headers: { "x-goog-api-key": apiKey } });
    if (!res.ok) throw new LlmError(`Gemini ${res.status}: ${await res.text()}`, "gemini", res.status);
    const body = (await res.json()) as {
      models?: { name: string; supportedGenerationMethods?: string[] }[];
      nextPageToken?: string;
    };
    for (const m of body.models ?? []) {
      if (m.supportedGenerationMethods?.includes("generateContent")) names.push(m.name.replace(/^models\//, ""));
    }
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return names;
}

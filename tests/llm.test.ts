import { describe, expect, it } from "vitest";
import { extractJson, generateWithFallback, providersFromEnv, type LlmProvider } from "@/src/lib/llm";
import { geminiProvider } from "@/src/lib/llm/gemini";
import { openAiCompatibleProvider } from "@/src/lib/llm/openai-compatible";

const ok = (name: string, text = "hi"): LlmProvider => ({ name, model: "m", generate: async () => ({ text, provider: name, model: "m" }) });
const bad = (name: string): LlmProvider => ({ name, model: "m", generate: async () => { throw new Error("quota exceeded"); } });

describe("providersFromEnv", () => {
  it("skips providers without keys and keeps the configured order", () => {
    const { providers, skipped } = providersFromEnv({ LLM_PROVIDERS: "groq,gemini,ollama", GEMINI_API_KEY: "k" });
    expect(providers.map((p) => p.name)).toEqual(["gemini", "ollama"]);
    expect(skipped).toEqual(["groq (no GROQ_API_KEY)"]);
  });
});

describe("generateWithFallback", () => {
  it("falls back to the next provider on error", async () => {
    const r = await generateWithFallback([bad("gemini"), ok("groq")], { system: "s", prompt: "p" });
    expect(r.provider).toBe("groq");
  });
  it("explains every failure when all fail", async () => {
    await expect(generateWithFallback([bad("a"), bad("b")], { system: "s", prompt: "p" })).rejects.toThrow(/a\/m: quota exceeded[\s\S]*b\/m/);
  });
  it("gives a helpful error with no providers", async () => {
    await expect(generateWithFallback([], { system: "s", prompt: "p" })).rejects.toThrow(/GEMINI_API_KEY/);
  });
});

describe("extractJson", () => {
  it("handles plain, fenced and wrapped JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Sure! {"a":3} Hope this helps')).toEqual({ a: 3 });
    expect(() => extractJson("no json")).toThrow();
  });
});

describe("provider request shapes", () => {
  it("gemini sends key in header, system instruction and JSON mode", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
    }) as unknown as typeof fetch;
    const r = await geminiProvider({ apiKey: "KEY", model: "gemini-flash-latest", fetch: f }).generate({ system: "S", prompt: "P", json: true });
    expect(r.text).toBe('{"ok":true}');
    expect(seen!.url).toContain("/models/gemini-flash-latest:generateContent");
    expect(seen!.url).not.toContain("KEY");
    expect((seen!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("KEY");
    const body = JSON.parse(seen!.init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe("S");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("gemini surfaces API errors with status", async () => {
    const f = (async () => Response.json({ error: { message: "Resource exhausted" } }, { status: 429 })) as unknown as typeof fetch;
    await expect(geminiProvider({ apiKey: "k", model: "m", fetch: f }).generate({ system: "s", prompt: "p" })).rejects.toThrow("Gemini 429: Resource exhausted");
  });

  it("openai-compatible sends bearer auth and json response_format", async () => {
    let init: RequestInit | undefined;
    const f = (async (_u: string, i: RequestInit) => {
      init = i;
      return Response.json({ choices: [{ message: { content: "x" } }] });
    }) as unknown as typeof fetch;
    await openAiCompatibleProvider({ name: "groq", baseUrl: "https://api.groq.com/openai/v1/", model: "m", apiKey: "K", fetch: f }).generate({ system: "s", prompt: "p", json: true });
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer K");
    expect(JSON.parse(init!.body as string).response_format).toEqual({ type: "json_object" });
  });
});

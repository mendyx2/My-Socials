import { geminiProvider } from "./gemini";
import { openAiCompatibleProvider } from "./openai-compatible";
import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse } from "./types";

export * from "./types";

type Env = Record<string, string | undefined>;

/** Builds the providers listed in LLM_PROVIDERS, skipping any without the settings they need. */
export function providersFromEnv(env: Env = process.env): { providers: LlmProvider[]; skipped: string[] } {
  const order = (env.LLM_PROVIDERS ?? "gemini,groq")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const providers: LlmProvider[] = [];
  const skipped: string[] = [];

  for (const name of order) {
    if (name === "gemini") {
      if (env.GEMINI_API_KEY) {
        providers.push(geminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || "gemini-flash-latest" }));
      } else skipped.push("gemini (no GEMINI_API_KEY)");
    } else if (name === "groq") {
      if (env.GROQ_API_KEY) {
        providers.push(
          openAiCompatibleProvider({
            name: "groq",
            baseUrl: "https://api.groq.com/openai/v1",
            apiKey: env.GROQ_API_KEY,
            model: env.GROQ_MODEL || "openai/gpt-oss-120b",
          }),
        );
      } else skipped.push("groq (no GROQ_API_KEY)");
    } else if (name === "ollama") {
      providers.push(
        openAiCompatibleProvider({
          name: "ollama",
          baseUrl: env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
          model: env.OLLAMA_MODEL || "llama3.1",
        }),
      );
    } else {
      skipped.push(`${name} (unknown provider)`);
    }
  }
  return { providers, skipped };
}

/** Tries each provider in order and returns the first success. Collects every error if all fail. */
export async function generateWithFallback(providers: LlmProvider[], req: LlmRequest): Promise<LlmResponse> {
  if (providers.length === 0) {
    throw new LlmError(
      "No AI provider is configured. Add GEMINI_API_KEY and/or GROQ_API_KEY to .env.local (see .env.example).",
      "none",
    );
  }
  const errors: string[] = [];
  for (const p of providers) {
    try {
      return await p.generate(req);
    } catch (err) {
      errors.push(`${p.name}/${p.model}: ${(err as Error).message}`);
    }
  }
  throw new LlmError(`All AI providers failed:\n- ${errors.join("\n- ")}`, "all");
}

/** Pulls a JSON object out of model output, tolerating ```json fences or text around it. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // fall through
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error("No JSON object found in the AI response");
}

/**
 * Asks each provider in turn for JSON and parses it with `parse`. A provider that errors,
 * or returns output that `parse` rejects, hands over to the next one.
 */
export async function generateJsonWithFallback<T>(
  providers: LlmProvider[],
  req: Omit<LlmRequest, "json">,
  parse: (raw: unknown) => T,
): Promise<{ value: T; generatedBy: string }> {
  if (providers.length === 0) {
    throw new LlmError(
      "No AI provider is configured. Add GEMINI_API_KEY and/or GROQ_API_KEY to .env.local (see .env.example).",
      "none",
    );
  }
  const errors: string[] = [];
  const attempt = async (r: Omit<LlmRequest, "json">, suffix: string) => {
    for (const p of providers) {
      const label = `${p.name}/${p.model}`;
      try {
        const res = await p.generate({ ...r, json: true });
        return { value: parse(extractJson(res.text)), generatedBy: label + suffix };
      } catch (err) {
        errors.push(`${label}${suffix}: ${(err as Error).message}`);
      }
    }
    return null;
  };
  const first = await attempt(req, "");
  if (first) return first;
  // Some free models can't read images. Rather than fail, try again with text only.
  if (req.images?.length) {
    const textOnly = await attempt({ ...req, images: undefined }, " (images not read)");
    if (textOnly) return textOnly;
  }
  throw new LlmError(`All AI providers failed:\n- ${errors.join("\n- ")}`, "all");
}

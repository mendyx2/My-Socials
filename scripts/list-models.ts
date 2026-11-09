import { loadEnv } from "./env";
import { listGeminiModels } from "../src/lib/llm/gemini";

loadEnv();
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("Set GEMINI_API_KEY in .env.local first.");
  process.exit(1);
}
const models = await listGeminiModels(key);
console.log("Gemini models your key can use (put one in GEMINI_MODEL):\n");
for (const m of models.filter((m) => m.includes("flash"))) console.log(`  ${m}`);
console.log(`\n(${models.length} models total; showing Flash models, which have the most generous free tier.)`);

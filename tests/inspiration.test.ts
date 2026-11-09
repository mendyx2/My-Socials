import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateJsonWithFallback, type LlmProvider, type LlmRequest } from "@/src/lib/llm";
import { geminiProvider } from "@/src/lib/llm/gemini";
import { openAiCompatibleProvider } from "@/src/lib/llm/openai-compatible";
import { loadInspiration } from "@/src/lib/media/inspiration";
import { MediaStore } from "@/src/lib/media/store";
import { parseIdeas, toStoredIdeas } from "@/src/lib/ideas/generate";
import { IdeaStore } from "@/src/lib/ideas/store";
import { DraftStore } from "@/src/lib/drafts/store";
import { draftIdea, regenerateDraftSection } from "@/src/lib/drafts/service";
import { cfg } from "./fixtures/config";
import { FileStorage } from "@/src/lib/storage";
import { PNG } from "./media.test";

const img = { mime: "image/png", data: Buffer.from(PNG).toString("base64") };

describe("providers send images", () => {
  it("gemini adds inlineData parts after the text", async () => {
    let body: any;
    const f = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return Response.json({ candidates: [{ content: { parts: [{ text: "{}" }] } }] });
    }) as unknown as typeof fetch;
    await geminiProvider({ apiKey: "k", model: "m", fetch: f }).generate({ system: "s", prompt: "p", images: [img] });
    expect(body.contents[0].parts).toEqual([{ text: "p" }, { inlineData: { mimeType: "image/png", data: img.data } }]);
  });

  it("openai-compatible sends text + image_url parts only when images exist", async () => {
    const bodies: any[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return Response.json({ choices: [{ message: { content: "{}" } }] });
    }) as unknown as typeof fetch;
    const p = openAiCompatibleProvider({ name: "groq", baseUrl: "https://x/v1", model: "m", fetch: f });
    await p.generate({ system: "s", prompt: "p", images: [img] });
    await p.generate({ system: "s", prompt: "p" });
    expect(bodies[0].messages[1].content[1]).toEqual({ type: "image_url", image_url: { url: `data:image/png;base64,${img.data}` } });
    expect(bodies[1].messages[1].content).toBe("p");
  });
});

describe("fallback when no model can read images", () => {
  it("retries text-only and says so", async () => {
    const seen: LlmRequest[] = [];
    const noVision: LlmProvider = {
      name: "groq",
      model: "text-only",
      async generate(req) {
        seen.push(req);
        if (req.images?.length) throw new Error("model does not support images");
        return { text: '{"ok":true}', provider: "groq", model: "text-only" };
      },
    };
    const r = await generateJsonWithFallback([noVision], { system: "s", prompt: "p", images: [img] }, (x) => x);
    expect(r.generatedBy).toBe("groq/text-only (images not read)");
    expect(seen.map((s) => s.images?.length ?? 0)).toEqual([1, 0]);
  });
});

describe("loadInspiration", () => {
  it("lists notes, numbers the images it sends, caps at 4, and skips deleted ones", async () => {
    const store = new MediaStore(new FileStorage(mkdtempSync(path.join(tmpdir(), "insp-"))));
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await store.add({ data: PNG, originalName: `ref${i}.png`, notes: i === 0 ? "Love the big numbers" : "" })).id);
    const r = await loadInspiration([...ids, "deleted-id"], store);
    expect(r.images).toHaveLength(4);
    expect(r.text).toContain("- ref0 [inspiration] (image 1): Love the big numbers");
    expect(r.text).toContain("- ref4 [inspiration] (image not sent)");
    expect(r.text).toMatch(/Don't copy their wording/);
    expect(r.text).not.toContain("deleted-id");
    expect(await loadInspiration([], store)).toEqual({ text: "", images: [] });
  });
});

describe("rewriting a draft with inspiration attached", () => {
  it("sends the notes and images with the rewrite", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "insp-draft-"));
    mkdirSync(path.join(dir, "profile"));
    writeFileSync(path.join(dir, "profile/about.md"), "Wendy");
    const storage = new FileStorage(dir);
    const media = new MediaStore(storage);
    const ref = await media.add({ data: PNG, originalName: "competitor-carousel.png", notes: "Short punchy slides" });
    const ideas = new IdeaStore(storage);
    const { ideas: parsed } = parseIdeas({ ideas: [{ title: "Idea", pillar: "web", format: "text", platforms: ["linkedin"], hook: "Hook", angle: "Angle", outline: ["a"], whyMe: "fits me", cta: "call" }] });
    const [idea] = toStoredIdeas(parsed, [], cfg, { now: new Date(), generatedBy: "x" });
    await ideas.add([idea]);
    const log: LlmRequest[] = [];
    const text = { format: "text", linkedin: { hook: "Hook here", body: "Body", cta: "Book", hashtags: [] }, instagram: { caption: "Cap", hashtags: [] } };
    const fake: LlmProvider = { name: "fake", model: "t", generate: async (req) => (log.push(req), { text: JSON.stringify(text), provider: "fake", model: "t" }) };
    const deps = { ideas, drafts: new DraftStore(storage), providers: [fake], storage, media };
    const { draft } = await draftIdea(idea.id, {}, deps);
    await deps.drafts.update(draft.id, { inspirationIds: [ref.id, ref.id] });
    expect((await deps.drafts.get(draft.id))!.inspirationIds).toEqual([ref.id]);
    await regenerateDraftSection(draft.id, "linkedin", undefined, deps);
    const last = log.at(-1)!;
    expect(last.prompt).toContain("competitor-carousel [inspiration] (image 1): Short punchy slides");
    expect(last.images).toHaveLength(1);
  });
});

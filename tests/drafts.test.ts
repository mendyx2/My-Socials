import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { LlmProvider, LlmRequest } from "@/src/lib/llm";
import { parseIdeas, toStoredIdeas } from "@/src/lib/ideas/generate";
import { IdeaStore } from "@/src/lib/ideas/store";
import { assembleInstagram, assembleLinkedIn, checkDraft, countPlaceholders, parseBannedWords } from "@/src/lib/drafts/checks";
import { parseDraftContent } from "@/src/lib/drafts/generate";
import { DraftContentSchema, type DraftContent } from "@/src/lib/drafts/schema";
import { draftCopyFromTranscript, draftIdea, regenerateDraftSection, NotFoundError } from "@/src/lib/drafts/service";
import { DraftStore } from "@/src/lib/drafts/store";
import { cfg } from "./fixtures/config";

const now = new Date("2026-11-09T08:00:00Z");

const textDraft = {
  format: "text",
  linkedin: { hook: "A slow website is a closed shop door.", body: "Para one.\n\nPara two.", cta: "Book a free call.", hashtags: ["webdev", "#SEO", "#seo", "Small Business"] },
  instagram: { caption: "Slow site? Fix it.\nLink in bio.", hashtags: ["#WebDesign"] },
};
const videoDraft = {
  format: "video",
  targetSeconds: 60,
  hooks: ["One codebase. Two app stores.", "Your app budget just got smaller.", "Flutter 4 in 60 seconds."],
  beats: [
    { seconds: 10, say: "Hook", onScreen: "Flutter 4", shot: "close-up" },
    { seconds: 35, say: "What changed", onScreen: "", shot: "" },
    { seconds: 15, say: "CTA" },
  ],
  cta: "Planning an app? Book a call.",
  teleprompter: "One codebase. Two app stores. Here's what changed.",
  instagram: { caption: "Flutter 4 explained.", hashtags: ["#Flutter"] },
  linkedin: { post: "Flutter 4 is out.\n\nHere's what it means for your budget.", hashtags: ["#Flutter"] },
};
const carouselDraft = {
  format: "carousel",
  slides: [
    { layout: "Cover", title: "Automate these 3 tasks first" },
    { layout: "stat", title: "Hours lost to admin", stat: "5 hrs/week", source: "Small businesses adopt AI automation" },
    { layout: "steps", title: "Start here", items: ["Invoices", "Leads", "FAQs"] },
    { layout: "cta", title: "Book a free call", body: "Link in bio" },
  ],
  instagram: { caption: "Save this.", hashtags: ["#Automation"] },
  linkedin: { post: "3 tasks to automate first.", hashtags: ["#AI"] },
};

describe("draft schema", () => {
  it("normalizes hashtags: adds #, strips spaces, removes duplicates", () => {
    const d = DraftContentSchema.parse(textDraft);
    expect(d.format === "text" && d.linkedin.hashtags).toEqual(["#webdev", "#SEO", "#seo", "#SmallBusiness"]);
  });
  it("fills defaults on slides and lowercases layouts", () => {
    const d = DraftContentSchema.parse(carouselDraft);
    expect(d.format === "carousel" && d.slides[0]).toMatchObject({ layout: "cover", body: "", items: [], stat: "" });
  });
  it("sets the known format even if the AI drops it", () => {
    const { format: _f, ...rest } = videoDraft;
    expect(parseDraftContent(rest, "video").format).toBe("video");
  });
  it("rejects a carousel with too few slides", () => {
    expect(() => DraftContentSchema.parse({ ...carouselDraft, slides: carouselDraft.slides.slice(0, 2) })).toThrow();
  });
});

describe("assemble", () => {
  it("builds ready-to-paste text", () => {
    const d = DraftContentSchema.parse(textDraft);
    expect(assembleLinkedIn(d)).toBe("A slow website is a closed shop door.\n\nPara one.\n\nPara two.\n\nBook a free call.\n\n#webdev #SEO #seo #SmallBusiness");
    expect(assembleInstagram(d)).toBe("Slow site? Fix it.\nLink in bio.\n\n#WebDesign");
  });
});

describe("checks", () => {
  const parse = (x: unknown) => DraftContentSchema.parse(x) as DraftContent;

  it("passes a clean draft", () => {
    expect(checkDraft(parse(textDraft))).toEqual([]);
    expect(checkDraft(parse(videoDraft))).toEqual([]);
    expect(checkDraft(parse(carouselDraft))).toEqual([]);
  });

  it("flags markdown, placeholders, banned words, long hooks, too many hashtags", () => {
    const d = parse({
      ...textDraft,
      linkedin: { hook: "x".repeat(230), body: "**Bold** claim. We helped [client name] save [X hours]. Let's delve in.", cta: "Book", hashtags: ["a", "b", "c", "d", "e", "f"] },
    });
    const msgs = checkDraft(d).map((w) => w.message).join("\n");
    expect(msgs).toMatch(/Markdown/);
    expect(msgs).toMatch(/2 placeholder/);
    expect(msgs).toMatch(/"delve"/);
    expect(msgs).toMatch(/cuts off around 210/);
    expect(msgs).toMatch(/6 hashtags/);
  });

  it("errors on an image layout with no image", () => {
    const d = parse({ ...carouselDraft, slides: [...carouselDraft.slides.slice(0, 3), { layout: "image", title: "Photo" }, carouselDraft.slides[3]] });
    expect(checkDraft(d)).toContainEqual(expect.objectContaining({ level: "error", message: expect.stringMatching(/Slide 4 uses the image layout/) }));
  });

  it("errors on an unsourced number in a carousel", () => {
    const d = parse({ ...carouselDraft, slides: carouselDraft.slides.map((s, i) => (i === 1 ? { ...s, source: "" } : s)) });
    expect(checkDraft(d)).toContainEqual(expect.objectContaining({ level: "error", section: "slides" }));
  });

  it("warns when a video script runs long", () => {
    const d = parse({ ...videoDraft, teleprompter: "word ".repeat(250), beats: [{ seconds: 60, say: "long" }, { seconds: 60, say: "longer" }] });
    const msgs = checkDraft(d).map((w) => w.message).join("\n");
    expect(msgs).toMatch(/Beats add up to 120s/);
    expect(msgs).toMatch(/~100s/);
  });

  it("reads banned words from voice.md", () => {
    expect(parseBannedWords('- **Words I never use:** "synergy", "rockstar"')).toEqual(["synergy", "rockstar"]);
    expect(parseBannedWords("- Words I never use: synergy, ninja")).toEqual(["synergy", "ninja"]);
    expect(parseBannedWords("nothing here")).toEqual([]);
    expect(countPlaceholders("[1] [your result] [X]% and [2]")).toBe(2);
  });
});

/** Fake AI: answers based on what the prompt asks for. */
function fakeAi(log: LlmRequest[] = []): LlmProvider {
  return {
    name: "fake",
    model: "t",
    async generate(req) {
      log.push(req);
      let out: unknown;
      if (req.prompt.includes("What she actually said")) {
        out = { instagram: { caption: "From transcript", hashtags: ["#T"] }, linkedin: { post: "From transcript LI", hashtags: [] } };
      } else if (req.prompt.includes('Rewrite only the "hooks"')) {
        out = { ...videoDraft, hooks: ["New hook A", "New hook B"], cta: "THIS SHOULD BE IGNORED", targetSeconds: 15 };
      } else if (req.prompt.includes('"format": "carousel"')) {
        out = carouselDraft;
      } else if (req.prompt.includes('"format": "video"')) {
        out = { ...videoDraft, targetSeconds: 45 }; // model ignores the requested length
      } else {
        out = textDraft;
      }
      return { text: JSON.stringify(out), provider: "fake", model: "t" };
    },
  };
}

async function setup(format: "text" | "video" | "carousel") {
  const dir = mkdtempSync(path.join(tmpdir(), "drafts-"));
  mkdirSync(path.join(dir, "profile"));
  writeFileSync(path.join(dir, "profile/voice.md"), '- Words I never use: "synergy"');
  const ideas = new IdeaStore(path.join(dir, "data"));
  const { ideas: parsed } = parseIdeas({
    ideas: [{ title: "Idea", pillar: "flutter", format, platforms: ["linkedin"], hook: "Hook", angle: "Angle", outline: ["a"], whyMe: "fits me", cta: "call" }],
  });
  const [idea] = toStoredIdeas(parsed, [], cfg, { now, generatedBy: "x" });
  await ideas.add([idea]);
  const log: LlmRequest[] = [];
  const deps = { ideas, drafts: new DraftStore(path.join(dir, "data")), providers: [fakeAi(log)], profileDir: path.join(dir, "profile"), now };
  return { idea, deps, log };
}

describe("draft service", () => {
  it("drafts an idea, stores it and marks the idea saved", async () => {
    const { idea, deps, log } = await setup("text");
    const { draft, warnings } = await draftIdea(idea.id, {}, deps);
    expect(draft.content.format).toBe("text");
    expect(draft.ideaTitle).toBe("Idea");
    expect(warnings).toEqual([]);
    expect(await deps.drafts.get(draft.id)).toEqual(draft);
    expect((await deps.ideas.list())[0].status).toBe("saved");
    expect(log[0].system).toMatch(/No Markdown/);
    expect(log[0].prompt).toContain("Hook: Hook");
  });

  it("keeps the requested video length and rejects odd lengths", async () => {
    const { idea, deps, log } = await setup("video");
    const { draft } = await draftIdea(idea.id, { targetSeconds: 30 }, deps);
    expect(draft.content.format === "video" && draft.content.targetSeconds).toBe(30);
    expect(log[0].prompt).toMatch(/30-second/);
    await expect(draftIdea(idea.id, { targetSeconds: 45 }, deps)).rejects.toThrow(/30, 60, 90/);
  });

  it("regenerates only the chosen section", async () => {
    const { idea, deps, log } = await setup("video");
    const { draft } = await draftIdea(idea.id, { targetSeconds: 60 }, deps);
    const { draft: after } = await regenerateDraftSection(draft.id, "hooks", "more provocative", deps);
    expect(after.content.format === "video" && after.content.hooks).toEqual(["New hook A", "New hook B"]);
    expect(after.content.format === "video" && after.content.cta).toBe(videoDraft.cta);
    expect(after.content.format === "video" && after.content.targetSeconds).toBe(60);
    expect(log.at(-1)!.prompt).toContain('"more provocative"');
    await expect(regenerateDraftSection(draft.id, "slides", undefined, deps)).rejects.toThrow(/Unknown section/);
    await expect(regenerateDraftSection("missing", "hooks", undefined, deps)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps her chosen slide images when the AI rewrites the slides", async () => {
    const { idea, deps } = await setup("carousel");
    const { draft } = await draftIdea(idea.id, {}, deps);
    const c = draft.content as any;
    c.slides[0].image = "photo-1";
    await deps.drafts.update(draft.id, { content: c });
    const { draft: after } = await regenerateDraftSection(draft.id, "slides", undefined, deps);
    expect((after.content as any).slides[0].image).toBe("photo-1");
  });

  it("rewrites captions from a transcript (video only)", async () => {
    const { idea, deps } = await setup("video");
    const { draft } = await draftIdea(idea.id, {}, deps);
    const { draft: after } = await draftCopyFromTranscript(draft.id, "So today I want to talk about Flutter 4 and your budget.", deps);
    expect(after.content.instagram.caption).toBe("From transcript");
    expect(after.content.format === "video" && after.content.hooks).toEqual(videoDraft.hooks);
    await expect(draftCopyFromTranscript(draft.id, "short", deps)).rejects.toThrow(/Paste the transcript/);
  });

  it("validates manual edits and blocks format changes", async () => {
    const { idea, deps } = await setup("text");
    const { draft } = await draftIdea(idea.id, {}, deps);
    const edited = await deps.drafts.update(draft.id, { content: { ...draft.content, instagram: { caption: "Edited", hashtags: [] } } as DraftContent, status: "approved" });
    expect(edited.status).toBe("approved");
    expect(edited.content.instagram.caption).toBe("Edited");
    await expect(deps.drafts.update(draft.id, { content: DraftContentSchema.parse(videoDraft) })).rejects.toThrow(/format/);
    await expect(deps.drafts.update(draft.id, { content: { format: "text" } as never })).rejects.toThrow();
  });
});

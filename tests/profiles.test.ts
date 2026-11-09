import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { LlmProvider, LlmRequest } from "@/src/lib/llm";
import { IdeaStore } from "@/src/lib/ideas/store";
import { allStrings, checkProfile } from "@/src/lib/profiles/checks";
import { ProfileContentSchema, type ProfileContent } from "@/src/lib/profiles/schema";
import {
  addLaunchPostsToIdeas, duplicateProfile, profileOverview, ProfileStore, rewriteProfileSection,
  setChecklistItem, updateProfile, writeProfiles,
} from "@/src/lib/profiles/service";
import { cfg } from "./fixtures/config";
import { FileStorage } from "@/src/lib/storage";
import { sampleProfile } from "./fixtures/profile";

const now = new Date("2026-11-09T08:00:00Z");
const parse = (x: unknown) => ProfileContentSchema.parse(x);
const sel = { headline: 0, bio: 0 };

describe("profile schema", () => {
  it("cleans the custom URL to a slug", () => {
    expect(parse(sampleProfile).linkedin.customUrl).toBe("wendy-atobor-dev");
  });
});

describe("profile checks", () => {
  it("only reports the expected placeholders on the sample", () => {
    const w = checkProfile(parse(sampleProfile), sel);
    expect(w.map((x) => x.message)).toEqual([expect.stringMatching(/4 placeholder/)]);
  });

  it("ignores JSON brackets when counting placeholders", () => {
    expect(allStrings({ a: ["x", { b: "[gap]" }], n: 1 })).toEqual(["x", "[gap]"]);
  });

  it("flags limits, missing CTA, missing recruiter keywords and inconsistency", () => {
    const c: ProfileContent = parse({
      ...sampleProfile,
      linkedin: { ...sampleProfile.linkedin, headlines: ["I help small businesses grow with web, flutter and automation magic " + "x".repeat(200)], about: "A".repeat(320) + "\n\nNo ask here." },
      instagram: { ...sampleProfile.instagram, bios: ["Coffee lover. ".repeat(12)], usernames: ["Bad Name!"], highlights: [{ name: "My amazing services", purpose: "" }], linkInBio: [{ label: "Portfolio", url: "x" }] },
    });
    const msgs = checkProfile(c, sel).map((w) => `${w.level}:${w.message}`).join("\n");
    expect(msgs).toMatch(/error:Headline option 1 is \d+\/220/);
    expect(msgs).toMatch(/first 300 show before "see more"/);
    expect(msgs).toMatch(/doesn't ask people to book a call/);
    expect(msgs).toMatch(/open to freelance/);
    expect(msgs).toMatch(/error:Bio option 1 is 1[0-9]{2}\/150/);
    expect(msgs).toMatch(/chosen bio has no call to action/);
    expect(msgs).toMatch(/Username "Bad Name!" isn't valid/);
    expect(msgs).toMatch(/will be cut off/);
    expect(msgs).toMatch(/Link in bio should include your booking link/);
    expect(msgs).toMatch(/LinkedIn mentions flutter but the chosen Instagram bio/);
  });

  it("checks the selected headline for recruiter keywords", () => {
    const c = parse({ ...sampleProfile, linkedin: { ...sampleProfile.linkedin, headlines: ["Frontend Developer", "I make things nice"] } });
    expect(checkProfile(c, { headline: 0, bio: 0 }).some((w) => /job-title/.test(w.message))).toBe(false);
    expect(checkProfile(c, { headline: 1, bio: 0 }).some((w) => /job-title/.test(w.message))).toBe(true);
  });
});

function fakeAi(log: LlmRequest[]): LlmProvider {
  return {
    name: "fake",
    model: "t",
    async generate(req) {
      log.push(req);
      let out: unknown = sampleProfile;
      if (req.prompt.includes('Rewrite only the "headline"')) {
        out = { ...sampleProfile, linkedin: { ...sampleProfile.linkedin, headlines: ["NEW Flutter Developer headline"], about: "SHOULD NOT CHANGE" } };
      }
      return { text: JSON.stringify(out), provider: "fake", model: "t" };
    },
  };
}

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), "profiles-"));
  mkdirSync(path.join(dir, "profile"));
  writeFileSync(path.join(dir, "profile/about.md"), "Wendy, OI.Dev, small businesses and startups");
  const log: LlmRequest[] = [];
  const storage = new FileStorage(dir);
  const deps = {
    store: new ProfileStore(storage),
    ideas: new IdeaStore(storage),
    providers: [fakeAi(log)],
    storage,
    cfg,
    now,
  };
  return { dir, deps, log };
}

describe("profile service", () => {
  it("writes a full profile version from the knowledge base", async () => {
    const { deps, log } = setup();
    const { version, warnings } = await writeProfiles("emphasise automation", deps);
    expect(version.status).toBe("draft");
    expect(version.content.linkedin.headlines).toHaveLength(3);
    expect(version.kbHash).toHaveLength(16);
    expect(warnings).toHaveLength(1);
    expect(log[0].prompt).toContain("Wendy, OI.Dev");
    expect(log[0].prompt).toContain('"emphasise automation"');
    expect(log[0].system).toMatch(/Never invent facts/);
  });

  it("rewrites one section, keeps the rest, and clamps the selection", async () => {
    const { deps } = setup();
    const { version } = await writeProfiles(undefined, deps);
    await updateProfile(version.id, { selected: { headline: 2, bio: 1 } }, deps);
    const { version: after } = await rewriteProfileSection(version.id, "headline", "shorter", deps);
    expect(after.content.linkedin.headlines).toEqual(["NEW Flutter Developer headline"]);
    expect(after.content.linkedin.about).toBe(sampleProfile.linkedin.about);
    expect(after.selected).toEqual({ headline: 0, bio: 1 });
    await expect(rewriteProfileSection(version.id, "nope", undefined, deps)).rejects.toThrow(/Unknown section/);
  });

  it("marks one version live, makes live versions read-only, and duplicates them", async () => {
    const { deps } = setup();
    const { version: a } = await writeProfiles(undefined, deps);
    const { version: b } = await writeProfiles(undefined, deps);
    await updateProfile(a.id, { status: "live" }, deps);
    await updateProfile(b.id, { status: "live" }, deps);
    const { versions } = await profileOverview(deps);
    expect(versions.find((v) => v.id === a.id)!.status).toBe("old");
    expect(versions.find((v) => v.id === b.id)!.status).toBe("live");
    await expect(updateProfile(b.id, { content: parse(sampleProfile) }, deps)).rejects.toThrow(/read-only/);
    await expect(rewriteProfileSection(b.id, "about", undefined, deps)).rejects.toThrow(/Only drafts/);
    const { version: copy } = await duplicateProfile(b.id, deps);
    expect(copy.status).toBe("draft");
    expect(copy.content).toEqual(b.content);
  });

  it("detects when the knowledge base changes after writing", async () => {
    const { dir, deps } = setup();
    const { version } = await writeProfiles(undefined, deps);
    expect((await profileOverview(deps)).currentKbHash).toBe(version.kbHash);
    writeFileSync(path.join(dir, "profile/updates.md"), "## 2026-11-20\n- Shipped a Flutter app for a bakery");
    expect((await profileOverview(deps)).currentKbHash).not.toBe(version.kbHash);
  });

  it("stores checklist progress", async () => {
    const { deps } = setup();
    await setChecklistItem("li-headline", true, deps);
    expect((await profileOverview(deps)).checklist).toEqual({ "li-headline": true });
  });

  it("sends launch posts to the ideas board as saved ideas", async () => {
    const { deps } = setup();
    const { version } = await writeProfiles(undefined, deps);
    const added = await addLaunchPostsToIdeas(version.id, [1], deps);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ title: "3 things I build for small businesses", format: "carousel", status: "saved", sources: [] });
    expect(added[0].pillar).toBe(cfg.pillars.proof ? "proof" : Object.keys(cfg.pillars)[0]);
    expect(await deps.ideas.list()).toHaveLength(1);
    await expect(addLaunchPostsToIdeas(version.id, [], deps)).rejects.toThrow(/No launch posts/);
  });
});

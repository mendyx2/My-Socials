import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { parseBannedWords } from "../drafts/checks";
import { NotFoundError } from "../drafts/service";
import { toStoredIdeas } from "../ideas/generate";
import type { StoredIdea } from "../ideas/schema";
import { IdeaStore } from "../ideas/store";
import { readJson, writeJson } from "../json-file";
import { kbToPrompt, loadKnowledgeBase, type KnowledgeBase } from "../kb";
import { generateJsonWithFallback, providersFromEnv, type LlmProvider } from "../llm";
import { loadFeedsConfig, type FeedsConfig } from "../news/config";
import { DATA_DIR } from "../paths";
import { checkProfile } from "./checks";
import { buildProfilePrompt, buildProfileSectionPrompt, PROFILE_SYSTEM } from "./prompt";
import { PROFILE_SECTIONS, ProfileContentSchema, type ProfileContent, type ProfileVersion } from "./schema";

interface ProfileFile {
  versions: ProfileVersion[];
  checklist: Record<string, boolean>;
}

/** Only these files define the profile; a voice.md tweak shouldn't mark profiles out of date. */
export function kbHash(kb: KnowledgeBase): string {
  return createHash("sha1").update([kb["about.md"], kb["pillars.md"], kb["updates.md"]].join("\n---\n")).digest("hex").slice(0, 16);
}

function getPath(obj: unknown, p: string): unknown {
  return p.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
}

function setPath<T>(obj: T, p: string, value: unknown): T {
  const [head, ...rest] = p.split(".");
  const src = obj as Record<string, unknown>;
  return { ...src, [head]: rest.length ? setPath(src[head], rest.join("."), value) : value } as T;
}

export class ProfileStore {
  constructor(private readonly dir = DATA_DIR) {}
  private get file() {
    return path.join(this.dir, "profiles.json");
  }
  async read(): Promise<ProfileFile> {
    const data = await readJson<Partial<ProfileFile>>(this.file, {});
    return { versions: data.versions ?? [], checklist: data.checklist ?? {} };
  }
  async write(data: ProfileFile): Promise<void> {
    await writeJson(this.file, data);
  }
  async get(id: string): Promise<ProfileVersion> {
    const v = (await this.read()).versions.find((x) => x.id === id);
    if (!v) throw new NotFoundError(`Profile version not found: ${id}`);
    return v;
  }
  async put(version: ProfileVersion): Promise<ProfileVersion> {
    const data = await this.read();
    const i = data.versions.findIndex((v) => v.id === version.id);
    if (i === -1) data.versions.unshift(version);
    else data.versions[i] = version;
    await this.write(data);
    return version;
  }
}

export interface ProfileDeps {
  store?: ProfileStore;
  ideas?: IdeaStore;
  providers?: LlmProvider[];
  profileDir?: string;
  cfg?: FeedsConfig;
  now?: Date;
}

async function ctx(deps: ProfileDeps) {
  const kb = await loadKnowledgeBase(deps.profileDir);
  return {
    kb,
    kbText: kbToPrompt(kb),
    hash: kbHash(kb),
    banned: parseBannedWords(kb["voice.md"]),
    store: deps.store ?? new ProfileStore(),
    providers: deps.providers ?? providersFromEnv().providers,
    now: (deps.now ?? new Date()).toISOString(),
  };
}

export function warnings(v: ProfileVersion, banned: string[] = []) {
  return checkProfile(v.content, v.selected, banned);
}

export async function writeProfiles(instruction: string | undefined, deps: ProfileDeps = {}) {
  const c = await ctx(deps);
  const { value, generatedBy } = await generateJsonWithFallback(
    c.providers,
    { system: PROFILE_SYSTEM, prompt: buildProfilePrompt(c.kbText, instruction?.trim() || undefined), temperature: 0.7 },
    (raw) => ProfileContentSchema.parse(raw),
  );
  const version: ProfileVersion = {
    id: randomUUID(),
    createdAt: c.now,
    updatedAt: c.now,
    status: "draft",
    generatedBy,
    selected: { headline: 0, bio: 0 },
    kbHash: c.hash,
    content: value,
  };
  await c.store.put(version);
  return { version, warnings: warnings(version, c.banned) };
}

export async function rewriteProfileSection(id: string, section: string, instruction: string | undefined, deps: ProfileDeps = {}) {
  const c = await ctx(deps);
  const paths = (PROFILE_SECTIONS as Record<string, readonly string[]>)[section];
  if (!paths) throw new Error(`Unknown section "${section}"`);
  const current = await c.store.get(id);
  if (current.status !== "draft") throw new Error("Only drafts can be rewritten. Start a new version from this one first.");
  const { value, generatedBy } = await generateJsonWithFallback(
    c.providers,
    {
      system: PROFILE_SYSTEM,
      prompt: buildProfileSectionPrompt({ kbText: c.kbText, current: current.content, section, paths, instruction: instruction?.trim() || undefined }),
      temperature: 0.9,
    },
    (raw) => {
      const fresh = ProfileContentSchema.parse(raw);
      let merged: ProfileContent = current.content;
      for (const p of paths) merged = setPath(merged, p, getPath(fresh, p));
      return ProfileContentSchema.parse(merged);
    },
  );
  // New option lists may be shorter; keep the selection valid.
  const selected = {
    headline: Math.min(current.selected.headline, value.linkedin.headlines.length - 1),
    bio: Math.min(current.selected.bio, value.instagram.bios.length - 1),
  };
  const version = await c.store.put({ ...current, content: value, selected, generatedBy, kbHash: c.hash, updatedAt: c.now });
  return { version, warnings: warnings(version, c.banned) };
}

/** Manual edits, choosing options, and status changes. "live" demotes the previous live version. */
export async function updateProfile(
  id: string,
  patch: { content?: ProfileContent; selected?: { headline: number; bio: number }; status?: "draft" | "live" },
  deps: ProfileDeps = {},
) {
  const c = await ctx(deps);
  const data = await c.store.read();
  const current = data.versions.find((v) => v.id === id);
  if (!current) throw new NotFoundError(`Profile version not found: ${id}`);
  if (current.status !== "draft" && patch.content) throw new Error("This version is read-only. Start a new version from it to edit.");
  const content = patch.content ? ProfileContentSchema.parse(patch.content) : current.content;
  const sel = patch.selected ?? current.selected;
  const selected = {
    headline: Math.max(0, Math.min(sel.headline, content.linkedin.headlines.length - 1)),
    bio: Math.max(0, Math.min(sel.bio, content.instagram.bios.length - 1)),
  };
  const updated: ProfileVersion = { ...current, content, selected, status: patch.status ?? current.status, updatedAt: c.now };
  data.versions = data.versions.map((v) => {
    if (v.id === id) return updated;
    if (patch.status === "live" && v.status === "live") return { ...v, status: "old" as const };
    return v;
  });
  await c.store.write(data);
  return { version: updated, warnings: warnings(updated, c.banned) };
}

/** Copies any version into a new editable draft. */
export async function duplicateProfile(id: string, deps: ProfileDeps = {}) {
  const c = await ctx(deps);
  const src = await c.store.get(id);
  const version: ProfileVersion = { ...src, id: randomUUID(), status: "draft", createdAt: c.now, updatedAt: c.now };
  await c.store.put(version);
  return { version, warnings: warnings(version, c.banned) };
}

export async function setChecklistItem(itemId: string, done: boolean, deps: ProfileDeps = {}) {
  const store = deps.store ?? new ProfileStore();
  const data = await store.read();
  data.checklist = { ...data.checklist, [itemId]: done };
  await store.write(data);
  return data.checklist;
}

/** Sends launch posts to the ideas board so they can be drafted like any other idea. */
export async function addLaunchPostsToIdeas(id: string, indexes: number[] | "all", deps: ProfileDeps = {}): Promise<StoredIdea[]> {
  const store = deps.store ?? new ProfileStore();
  const ideas = deps.ideas ?? new IdeaStore();
  const v = await store.get(id);
  const posts = v.content.launchPosts.filter((_, i) => indexes === "all" || indexes.includes(i));
  if (posts.length === 0) throw new Error("No launch posts selected");
  const cfg = deps.cfg ?? (await loadFeedsConfig());
  const stored = toStoredIdeas(
    posts.map((p) => ({ ...p, sourceIds: [] })),
    [],
    cfg,
    { now: deps.now ?? new Date(), generatedBy: `profile writer (${v.generatedBy})` },
  ).map((i) => ({ ...i, status: "saved" as const }));
  await ideas.add(stored);
  return stored;
}

/** Overview for the page: versions, checklist, and whether the live/draft version is out of date. */
export async function profileOverview(deps: ProfileDeps = {}) {
  const c = await ctx(deps);
  const data = await c.store.read();
  return {
    versions: data.versions,
    checklist: data.checklist,
    currentKbHash: c.hash,
    banned: c.banned,
  };
}

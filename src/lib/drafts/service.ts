import { kbToPrompt, loadKnowledgeBase } from "../kb";
import { providersFromEnv, type LlmProvider } from "../llm";
import { IdeaStore } from "../ideas/store";
import { loadInspiration } from "../media/inspiration";
import { MediaStore } from "../media/store";
import { getStorage, type Storage } from "../storage";
import { checkDraft, parseBannedWords, type DraftWarning } from "./checks";
import { copyFromTranscript, createDraft, regenerateSection } from "./generate";
import type { StoredDraft } from "./schema";
import { DraftStore } from "./store";

export interface DraftDeps {
  ideas?: IdeaStore;
  drafts?: DraftStore;
  providers?: LlmProvider[];
  /** Where everything lives; defaults to files locally / Netlify Blobs when hosted. */
  storage?: Storage;
  media?: MediaStore;
  now?: Date;
}

export class NotFoundError extends Error {}

async function context(deps: DraftDeps) {
  const storage = deps.storage ?? (await getStorage());
  const kb = await loadKnowledgeBase(storage);
  return {
    ideas: deps.ideas ?? new IdeaStore(storage),
    drafts: deps.drafts ?? new DraftStore(storage),
    media: deps.media ?? new MediaStore(storage),
    providers: deps.providers ?? providersFromEnv().providers,
    kbText: kbToPrompt(kb),
    banned: parseBannedWords(kb["voice.md"]),
  };
}

async function findIdea(ideas: IdeaStore, id: string) {
  const idea = (await ideas.list()).find((i) => i.id === id);
  if (!idea) throw new NotFoundError(`Idea not found: ${id}`);
  return idea;
}

export async function warningsFor(draft: StoredDraft, storage?: Storage): Promise<DraftWarning[]> {
  const kb = await loadKnowledgeBase(storage);
  return checkDraft(draft.content, parseBannedWords(kb["voice.md"]));
}

/** Draft an idea. The idea moves from "new" to "saved" so it stays on the to-do list. */
export async function draftIdea(ideaId: string, opts: { targetSeconds?: number } = {}, deps: DraftDeps = {}) {
  const ctx = await context(deps);
  const idea = await findIdea(ctx.ideas, ideaId);
  const draft = await createDraft({ idea, kbText: ctx.kbText, providers: ctx.providers, targetSeconds: opts.targetSeconds, now: deps.now });
  await ctx.drafts.put(draft);
  if (idea.status === "new") await ctx.ideas.update(idea.id, { status: "saved" });
  return { draft, warnings: checkDraft(draft.content, ctx.banned) };
}

export async function regenerateDraftSection(id: string, section: string, instruction: string | undefined, deps: DraftDeps = {}) {
  const ctx = await context(deps);
  const draft = await ctx.drafts.get(id);
  if (!draft) throw new NotFoundError(`Draft not found: ${id}`);
  const idea = await findIdea(ctx.ideas, draft.ideaId);
  const inspiration = await loadInspiration(draft.inspirationIds, ctx.media);
  const updated = await regenerateSection({ draft, idea, section, instruction, kbText: ctx.kbText, providers: ctx.providers, inspiration, now: deps.now });
  await ctx.drafts.put(updated);
  return { draft: updated, warnings: checkDraft(updated.content, ctx.banned) };
}

export async function draftCopyFromTranscript(id: string, transcript: string, deps: DraftDeps = {}) {
  const ctx = await context(deps);
  const draft = await ctx.drafts.get(id);
  if (!draft) throw new NotFoundError(`Draft not found: ${id}`);
  const idea = await findIdea(ctx.ideas, draft.ideaId);
  const inspiration = await loadInspiration(draft.inspirationIds, ctx.media);
  const updated = await copyFromTranscript({ draft, idea, transcript, kbText: ctx.kbText, providers: ctx.providers, inspiration, now: deps.now });
  await ctx.drafts.put(updated);
  return { draft: updated, warnings: checkDraft(updated.content, ctx.banned) };
}

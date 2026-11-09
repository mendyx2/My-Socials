import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateJsonWithFallback, type LlmProvider } from "../llm";
import type { StoredIdea } from "../ideas/schema";
import type { Inspiration } from "../media/inspiration";
import { buildDraftPrompt, buildSectionPrompt, buildTranscriptPrompt, DRAFT_SYSTEM } from "./prompt";
import {
  DraftContentSchema,
  InstagramCopySchema,
  LinkedInCopySchema,
  SECTIONS,
  VIDEO_LENGTHS,
  type DraftContent,
  type StoredDraft,
} from "./schema";

/** The model sometimes drops or misnames "format"; we already know it, so set it. */
export function parseDraftContent(raw: unknown, format: DraftContent["format"]): DraftContent {
  if (!raw || typeof raw !== "object") throw new Error("AI response is not an object");
  return DraftContentSchema.parse({ ...(raw as object), format });
}

export async function createDraft(args: {
  idea: StoredIdea;
  kbText: string;
  providers: LlmProvider[];
  targetSeconds?: number;
  now?: Date;
}): Promise<StoredDraft> {
  const { idea, kbText, providers } = args;
  const now = (args.now ?? new Date()).toISOString();
  const targetSeconds = args.targetSeconds ?? 60;
  if (idea.format === "video" && !(VIDEO_LENGTHS as readonly number[]).includes(targetSeconds)) {
    throw new Error(`Video length must be one of ${VIDEO_LENGTHS.join(", ")} seconds`);
  }
  const { value, generatedBy } = await generateJsonWithFallback(
    providers,
    { system: DRAFT_SYSTEM, prompt: buildDraftPrompt({ kbText, idea, targetSeconds }), temperature: 0.7 },
    (raw) => {
      const content = parseDraftContent(raw, idea.format);
      // Keep the length she asked for even if the model "corrects" it.
      return content.format === "video" ? { ...content, targetSeconds } : content;
    },
  );
  return {
    id: randomUUID(),
    ideaId: idea.id,
    ideaTitle: idea.title,
    createdAt: now,
    updatedAt: now,
    status: "draft",
    generatedBy,
    content: value,
    sources: idea.sources,
  };
}

/** Rewrites one section; every other field is kept exactly as it was. */
export async function regenerateSection(args: {
  draft: StoredDraft;
  idea: StoredIdea;
  section: string;
  instruction?: string;
  kbText: string;
  providers: LlmProvider[];
  inspiration?: Inspiration;
  now?: Date;
}): Promise<StoredDraft> {
  const { draft, idea, section, instruction, kbText, providers } = args;
  const current = draft.content;
  const sections = SECTIONS[current.format] as Record<string, readonly string[]>;
  const fields = sections[section];
  if (!fields) throw new Error(`Unknown section "${section}" for a ${current.format} draft`);

  const { value, generatedBy } = await generateJsonWithFallback(
    providers,
    {
      system: DRAFT_SYSTEM,
      prompt: buildSectionPrompt({ kbText, idea, current, section, fields, instruction: instruction?.trim() || undefined }) + (args.inspiration?.text ?? ""),
      temperature: 0.9,
      images: args.inspiration?.images.length ? args.inspiration.images : undefined,
    },
    (raw) => {
      const fresh = parseDraftContent(raw, current.format) as Record<string, unknown>;
      const merged: Record<string, unknown> = { ...current };
      for (const f of fields) merged[f] = fresh[f];
      // The AI never picks images; keep the ones she chose, slide by slide.
      if (current.format === "carousel" && Array.isArray(merged.slides)) {
        merged.slides = (merged.slides as { image?: string }[]).map((s, i) => (s.image ? s : { ...s, image: current.slides[i]?.image ?? "" }));
      }
      return DraftContentSchema.parse(merged);
    },
  );
  return { ...draft, content: value, generatedBy, updatedAt: (args.now ?? new Date()).toISOString() };
}

const TranscriptCopySchema = z.object({ instagram: InstagramCopySchema, linkedin: LinkedInCopySchema });

/** After recording: rewrites the captions from what she actually said. */
export async function copyFromTranscript(args: {
  draft: StoredDraft;
  idea: StoredIdea;
  transcript: string;
  kbText: string;
  providers: LlmProvider[];
  inspiration?: Inspiration;
  now?: Date;
}): Promise<StoredDraft> {
  const { draft, idea, transcript, kbText, providers } = args;
  if (draft.content.format !== "video") throw new Error("Transcripts only apply to video drafts");
  if (transcript.trim().length < 20) throw new Error("Paste the transcript first (at least a couple of sentences).");
  const current = draft.content;
  const { value, generatedBy } = await generateJsonWithFallback(
    providers,
    {
      system: DRAFT_SYSTEM,
      prompt: buildTranscriptPrompt({ kbText, idea, current, transcript }) + (args.inspiration?.text ?? ""),
      temperature: 0.7,
      images: args.inspiration?.images.length ? args.inspiration.images : undefined,
    },
    (raw) => TranscriptCopySchema.parse(raw),
  );
  return {
    ...draft,
    content: { ...current, instagram: value.instagram, linkedin: value.linkedin },
    generatedBy,
    updatedAt: (args.now ?? new Date()).toISOString(),
  };
}

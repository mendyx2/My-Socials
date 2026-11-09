import { z } from "zod";

export const LINKEDIN_MAX = 3000;
export const INSTAGRAM_MAX = 2200;
export const VIDEO_LENGTHS = [30, 60, 90] as const;
export const SLIDE_LAYOUTS = ["cover", "point", "stat", "steps", "comparison", "quote", "checklist", "image", "cta"] as const;
export const SLIDE_VARIANTS = ["dark", "light", "accent"] as const;
export const DRAFT_STATUSES = ["draft", "approved", "posted"] as const;

const str = (max: number) => z.string().trim().min(1).max(max);
/** Accepts "#tag", "tag" or "two words" and stores "#Tag"-style, no spaces, no duplicates. */
const hashtags = z
  .array(z.string())
  .default([])
  .transform((tags) => [
    ...new Set(
      tags
        .map((t) => t.trim().replace(/^#+/, "").replace(/\s+/g, ""))
        .filter(Boolean)
        .map((t) => `#${t}`),
    ),
  ]);

export const InstagramCopySchema = z.object({ caption: str(INSTAGRAM_MAX), hashtags });
export const LinkedInCopySchema = z.object({ post: str(LINKEDIN_MAX), hashtags });

export const TextDraftSchema = z.object({
  format: z.literal("text"),
  linkedin: z.object({ hook: str(400), body: str(LINKEDIN_MAX), cta: str(500), hashtags }),
  instagram: InstagramCopySchema,
});

export const BeatSchema = z.object({
  seconds: z.coerce.number().min(1).max(90),
  say: str(600),
  onScreen: z.string().trim().max(200).default(""),
  shot: z.string().trim().max(300).default(""),
});

export const VideoDraftSchema = z.object({
  format: z.literal("video"),
  targetSeconds: z.coerce.number().int().min(10).max(180),
  hooks: z.array(str(300)).min(1).max(5),
  beats: z.array(BeatSchema).min(1).max(12),
  cta: str(300),
  teleprompter: str(5000),
  instagram: InstagramCopySchema,
  linkedin: LinkedInCopySchema,
});

export const SlideSchema = z.object({
  layout: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.enum(SLIDE_LAYOUTS)),
  title: str(140),
  body: z.string().trim().max(400).default(""),
  /** Bullet items for steps / checklist / comparison layouts. */
  items: z.array(z.string().trim().min(1).max(160)).max(8).default([]),
  /** A number to show big on a "stat" slide. Must have a source. */
  stat: z.string().trim().max(40).default(""),
  source: z.string().trim().max(300).default(""),
  /** Colour style of this slide. */
  variant: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.enum(SLIDE_VARIANTS)).catch("dark").default("dark"),
  /** Library image id. Fills the slide on "cover"/"image" layouts, shown as a picture on the others. */
  image: z.string().trim().max(60).default(""),
});

export const CarouselDraftSchema = z.object({
  format: z.literal("carousel"),
  slides: z.array(SlideSchema).min(3).max(12),
  instagram: InstagramCopySchema,
  linkedin: LinkedInCopySchema,
});

export const DraftContentSchema = z.discriminatedUnion("format", [TextDraftSchema, VideoDraftSchema, CarouselDraftSchema]);

export type TextDraft = z.infer<typeof TextDraftSchema>;
export type VideoDraft = z.infer<typeof VideoDraftSchema>;
export type CarouselDraft = z.infer<typeof CarouselDraftSchema>;
export type DraftContent = z.infer<typeof DraftContentSchema>;
export type DraftFormat = DraftContent["format"];
export type DraftStatus = (typeof DRAFT_STATUSES)[number];
export type Slide = z.infer<typeof SlideSchema>;

/** Sections that can be regenerated on their own, and the top-level fields each one owns. */
export const SECTIONS = {
  text: { linkedin: ["linkedin"], instagram: ["instagram"] },
  video: { hooks: ["hooks"], script: ["beats", "cta", "teleprompter"], instagram: ["instagram"], linkedin: ["linkedin"] },
  carousel: { slides: ["slides"], instagram: ["instagram"], linkedin: ["linkedin"] },
} as const satisfies Record<DraftFormat, Record<string, readonly string[]>>;

export type SectionName<F extends DraftFormat = DraftFormat> = keyof (typeof SECTIONS)[F] & string;

export function sectionsFor(format: DraftFormat): string[] {
  return Object.keys(SECTIONS[format]);
}

export interface StoredDraft {
  id: string;
  ideaId: string;
  ideaTitle: string;
  createdAt: string;
  updatedAt: string;
  status: DraftStatus;
  generatedBy: string;
  content: DraftContent;
  sources: { title: string; url: string; source: string }[];
  /** Library images attached as inspiration; used when rewriting. */
  inspirationIds?: string[];
}

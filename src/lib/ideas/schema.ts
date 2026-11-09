import { z } from "zod";

export const FORMATS = ["text", "carousel", "video"] as const;
export const PLATFORMS = ["linkedin", "instagram"] as const;
export const AUDIENCES = ["clients", "recruiters", "both"] as const;
export const STATUSES = ["new", "saved", "used", "rejected"] as const;

export type IdeaStatus = (typeof STATUSES)[number];

/** Lenient on case and extra whitespace, because model output varies. */
const lowerEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.enum(values));

/** What the AI must return for each idea. */
export const GeneratedIdeaSchema = z.object({
  title: z.string().min(3).max(200),
  pillar: z.string().min(1),
  format: lowerEnum(FORMATS),
  platforms: z.array(lowerEnum(PLATFORMS)).min(1),
  audience: lowerEnum(AUDIENCES).default("clients"),
  hook: z.string().min(3).max(400),
  angle: z.string().min(3).max(800),
  outline: z.array(z.string().min(1)).min(1).max(12),
  whyMe: z.string().min(3).max(600),
  cta: z.string().min(2).max(300),
  sourceIds: z.array(z.string()).default([]),
});

export const GeneratedIdeasSchema = z.object({ ideas: z.array(GeneratedIdeaSchema).min(1) });

export type GeneratedIdea = z.infer<typeof GeneratedIdeaSchema>;

export interface IdeaSource {
  title: string;
  url: string;
  source: string;
}

export interface StoredIdea extends Omit<GeneratedIdea, "sourceIds"> {
  id: string;
  createdAt: string;
  runDate: string; // YYYY-MM-DD
  status: IdeaStatus;
  sources: IdeaSource[];
  generatedBy: string; // provider/model
  notes?: string;
}

import { z } from "zod";
import { GeneratedIdeaSchema } from "../ideas/schema";

/**
 * Platform limits used for warnings. Best-known values as of late 2026; platforms change them,
 * so they only ever produce warnings, never block saving. ⚠ = less certain.
 */
export const LIMITS = {
  linkedinHeadline: 220,
  linkedinAbout: 2600,
  /** Roughly what shows before "see more" in About (varies by device). ⚠ */
  linkedinAboutFold: 300,
  linkedinExperience: 2000,
  instagramBio: 150,
  /** ⚠ Some sources say 64; 30 is the safe target for the searchable name field. */
  instagramName: 30,
  instagramUsername: 30,
  /** ⚠ Highlight titles get cut off around 15 characters under the circle. */
  instagramHighlight: 15,
} as const;

export const PROFILE_STATUSES = ["draft", "live", "old"] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

const s = (max: number) => z.string().trim().min(1).max(max);

export const ProfileContentSchema = z.object({
  linkedin: z.object({
    // Generous maxima: over-limit text is a warning in the UI, not a parse failure.
    headlines: z.array(s(400)).min(1).max(5),
    about: s(4000),
    experience: z
      .array(
        z.object({
          title: s(120),
          company: s(120),
          employmentType: z.string().trim().max(60).default(""),
          description: s(3000),
        }),
      )
      .min(1)
      .max(4),
    skills: z.array(s(80)).min(3).max(50),
    featured: z.array(z.object({ title: s(120), description: z.string().trim().max(300).default(""), link: z.string().trim().max(300).default("") })).max(5).default([]),
    customUrl: z
      .string()
      .trim()
      .transform((v) => v.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, "").replace(/\/+$/, "").toLowerCase()),
    openToWork: z.object({ jobTitles: z.array(s(80)).min(1).max(10), workTypes: z.array(s(40)).default([]), note: z.string().trim().max(500).default("") }),
    banner: z.object({ headline: s(80), subline: z.string().trim().max(120).default(""), cta: z.string().trim().max(60).default("") }),
  }),
  instagram: z.object({
    bios: z.array(s(300)).min(1).max(5),
    name: s(80),
    usernames: z.array(z.string().trim().min(1).max(60)).max(6).default([]),
    linkInBio: z.array(z.object({ label: s(60), url: z.string().trim().max(300).default("") })).min(1).max(6),
    highlights: z.array(z.object({ name: s(40), purpose: z.string().trim().max(200).default("") })).max(8).default([]),
    pinnedPosts: z.array(z.object({ title: s(150), purpose: z.string().trim().max(300).default("") })).max(3).default([]),
  }),
  launchPosts: z.array(GeneratedIdeaSchema.omit({ sourceIds: true })).max(6).default([]),
});

export type ProfileContent = z.infer<typeof ProfileContentSchema>;

/** Sections that can be rewritten on their own, as dotted paths into ProfileContent. */
export const PROFILE_SECTIONS = {
  headline: ["linkedin.headlines"],
  about: ["linkedin.about"],
  experience: ["linkedin.experience"],
  linkedinExtras: ["linkedin.skills", "linkedin.featured", "linkedin.customUrl", "linkedin.openToWork", "linkedin.banner"],
  instagramBio: ["instagram.bios", "instagram.name", "instagram.usernames"],
  instagramExtras: ["instagram.linkInBio", "instagram.highlights", "instagram.pinnedPosts"],
  launchPosts: ["launchPosts"],
} as const;
export type ProfileSection = keyof typeof PROFILE_SECTIONS;

export interface ProfileVersion {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: ProfileStatus;
  generatedBy: string;
  /** Which headline / bio option is chosen (index into the arrays). */
  selected: { headline: number; bio: number };
  /** Hash of the knowledge base it was written from, to spot when it goes out of date. */
  kbHash: string;
  content: ProfileContent;
}

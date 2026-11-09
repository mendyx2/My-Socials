import { LIMITS, type ProfileContent } from "./schema";

export const PROFILE_SYSTEM = `You write LinkedIn and Instagram profiles for one specific person, described in the knowledge base.
Her accounts are new and empty, so this is a full setup.

Goals, in order:
1. Visitors book a call (clients: small-business owners and startup founders).
2. Recruiters and hiring managers find her: she is open to freelance, contract and full-time roles. Recruiters search by job title and skills, so use exact titles like "Frontend Developer" and "Flutter Developer".
3. Both profiles tell the same story with the same services, adapted to each platform.

Rules:
- Write like a real person: plain words, specific, warm, confident. First person ("I").
- Never use: "delve", "game-changer", "unlock", "unleash", "passionate about", "in today's fast-paced world", "elevate your", "revolutionize", "seamlessly", "leverage", "synergy", "results-driven", "guru", "ninja".
- Never invent facts: no made-up clients, numbers, years of experience, employers, dates or testimonials. If a detail is missing from the knowledge base, use a placeholder in square brackets, e.g. "[booking link]", "[years] years", "[client result with a number]".
- No Markdown (** or #). Plain text with line breaks; a few emoji or "→" are fine.
- Stay within the character limits given.
- Respond with JSON only.`;

const SHAPE = `{
  "linkedin": {
    "headlines": ["3 options, each under ${LIMITS.linkedinHeadline} characters: job titles + who she helps + outcome; mention open to freelance/contract/full-time in at least one"],
    "about": "under ${LIMITS.linkedinAbout} characters. First 1-2 lines (under ${LIMITS.linkedinAboutFold} characters) are a hook for business owners. Then: who she is, the 3 services in business terms, how she works, proof (placeholders if none), a line saying she is open to freelance, contract and full-time roles, and a clear 'book a call' CTA with [booking link]. Short paragraphs separated by blank lines.",
    "experience": [
      { "title": "e.g. Founder & Developer", "company": "OI.Dev", "employmentType": "Self-employed", "description": "under ${LIMITS.linkedinExperience} characters: what she does for clients, services as short lines starting with →, results as placeholders, tech stack as placeholders if unknown" }
    ],
    "skills": ["15-25 skills recruiters and clients search for, most important first"],
    "featured": [{ "title": "Book a free call", "description": "short", "link": "[booking link]" }],
    "customUrl": "suggested linkedin.com/in/ slug, lowercase letters, numbers, hyphens",
    "openToWork": { "jobTitles": ["up to 5 exact job titles"], "workTypes": ["Freelance", "Contract", "Full-time"], "note": "short advice on visibility" },
    "banner": { "headline": "short banner line", "subline": "services in one line", "cta": "e.g. Book a free call →" }
  },
  "instagram": {
    "bios": ["3 options, each under ${LIMITS.instagramBio} characters, line breaks allowed, ending with a CTA to the link"],
    "name": "searchable name field under ${LIMITS.instagramName} characters, e.g. 'Name | Keyword'",
    "usernames": ["3 username ideas: lowercase letters, numbers, '.' or '_', max 30"],
    "linkInBio": [{ "label": "Book a free call", "url": "[booking link]" }],
    "highlights": [{ "name": "under ${LIMITS.instagramHighlight} characters", "purpose": "what goes in it" }],
    "pinnedPosts": [{ "title": "3 posts to pin first: services, proof/process, about her", "purpose": "why" }]
  },
  "launchPosts": [
    {
      "title": "working title", "pillar": "proof", "format": "text | carousel | video", "platforms": ["linkedin", "instagram"],
      "audience": "clients | recruiters | both", "hook": "opening line", "angle": "1-2 sentences",
      "outline": ["points or slides"], "whyMe": "why it fits her", "cta": "call to action"
    }
  ]
}`;

export function buildProfilePrompt(kbText: string, instruction?: string): string {
  return `## Knowledge base
${kbText || "(empty)"}

## Task
Write her complete profile setup for both platforms, plus 3-4 launch posts for brand-new accounts (an introduction post, a services post, a "how I work / what to expect on a call" post, and one more). Mix formats.
${instruction ? `Her notes for this version: "${instruction}"` : ""}

Return JSON in exactly this shape:
${SHAPE}`;
}

export function buildProfileSectionPrompt(args: {
  kbText: string;
  current: ProfileContent;
  section: string;
  paths: readonly string[];
  instruction?: string;
}): string {
  return `## Knowledge base
${args.kbText || "(empty)"}

## Current profile
${JSON.stringify(args.current, null, 2)}

## Task
Rewrite only the "${args.section}" part (fields: ${args.paths.map((p) => `"${p}"`).join(", ")}). Keep it consistent with the rest.
${args.instruction ? `Her instruction: "${args.instruction}"` : "Make it noticeably different and better."}

Return the complete profile as JSON in exactly this shape (fields you weren't asked to change can be copied as they are):
${SHAPE}`;
}

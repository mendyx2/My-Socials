// Pure functions: used by both the server and the browser (no Node imports here).
import { INSTAGRAM_MAX, LINKEDIN_MAX, type DraftContent } from "./schema";

export interface DraftWarning {
  level: "error" | "warn";
  section: string;
  message: string;
}

/** Phrases that make posts sound AI-written. Extended by "Words I never use" in voice.md. */
export const DEFAULT_BANNED = [
  "delve",
  "game-changer",
  "game changer",
  "unlock",
  "unleash",
  "in today's fast-paced world",
  "in today's digital age",
  "elevate your",
  "revolutionize",
  "seamlessly",
  "leverage",
  "tapestry",
  "it's not just",
];

/** LinkedIn shows roughly the first ~210 characters before "…see more" (varies by device). */
export const LINKEDIN_FOLD = 210;
const WORDS_PER_SECOND = 2.5;

const tagLine = (tags: string[]) => (tags.length ? `\n\n${tags.join(" ")}` : "");

export function assembleLinkedIn(c: DraftContent): string {
  if (c.format === "text") {
    return `${c.linkedin.hook}\n\n${c.linkedin.body}\n\n${c.linkedin.cta}${tagLine(c.linkedin.hashtags)}`;
  }
  return `${c.linkedin.post}${tagLine(c.linkedin.hashtags)}`;
}

export function assembleInstagram(c: DraftContent): string {
  return `${c.instagram.caption}${tagLine(c.instagram.hashtags)}`;
}

/** Reads the "Words I never use" line from voice.md. */
export function parseBannedWords(voiceMd: string): string[] {
  const line = voiceMd.split("\n").find((l) => /never use/i.test(l));
  if (!line) return [];
  const after = line.slice(line.indexOf(":") + 1).replace(/\*\*/g, "");
  const quoted = [...after.matchAll(/["“']([^"”']+)["”']/g)].map((m) => m[1]);
  const words = quoted.length
    ? quoted
    : after
        .replace(/_|e\.g\./g, "")
        .split(/[,;]/)
        .map((w) => w.trim());
  return words.map((w) => w.toLowerCase()).filter((w) => w.length > 1 && !w.startsWith("..."));
}

export function countPlaceholders(text: string): number {
  // "[your result here]" or "[X]" style gaps the AI leaves for you to fill in.
  // Plain numbers like "[1]" are footnotes, not gaps.
  return (text.match(/\[[^\]\n]+\]/g) ?? []).filter((m) => !/^\[\d+\]$/.test(m)).length;
}

function allText(c: DraftContent): string {
  const parts: string[] = [assembleLinkedIn(c), assembleInstagram(c)];
  if (c.format === "video") parts.push(c.hooks.join("\n"), c.teleprompter, c.cta, ...c.beats.flatMap((b) => [b.say, b.onScreen]));
  if (c.format === "carousel") parts.push(...c.slides.flatMap((s) => [s.title, s.body, s.stat, ...s.items]));
  return parts.join("\n");
}

export function checkDraft(c: DraftContent, extraBanned: string[] = []): DraftWarning[] {
  const w: DraftWarning[] = [];
  const li = assembleLinkedIn(c);
  const ig = assembleInstagram(c);

  if (li.length > LINKEDIN_MAX) w.push({ level: "error", section: "linkedin", message: `LinkedIn post is ${li.length}/${LINKEDIN_MAX} characters.` });
  if (ig.length > INSTAGRAM_MAX) w.push({ level: "error", section: "instagram", message: `Instagram caption is ${ig.length}/${INSTAGRAM_MAX} characters.` });

  const firstChunk = c.format === "text" ? c.linkedin.hook : c.linkedin.post.split("\n\n")[0];
  if (firstChunk.length > LINKEDIN_FOLD) {
    w.push({ level: "warn", section: "linkedin", message: `The opening is ${firstChunk.length} characters; LinkedIn cuts off around ${LINKEDIN_FOLD} with "see more". Shorten the hook.` });
  }

  for (const [section, text] of [["linkedin", li], ["instagram", ig]] as const) {
    if (/\*\*[^*]+\*\*|__[^_]+__|^#{1,6}\s/m.test(text)) {
      w.push({ level: "warn", section, message: "Contains Markdown (**bold** or # headings). LinkedIn and Instagram show it as raw symbols." });
    }
  }

  const liTags = c.linkedin.hashtags.length;
  const igTags = c.instagram.hashtags.length;
  if (liTags > 5) w.push({ level: "warn", section: "linkedin", message: `${liTags} hashtags. 3–5 is plenty on LinkedIn.` });
  if (igTags > 5) w.push({ level: "warn", section: "instagram", message: `${igTags} hashtags. Instagram now favours a few (3–5) relevant ones.` });

  const placeholders = countPlaceholders(allText(c));
  if (placeholders) {
    w.push({ level: "warn", section: "all", message: `${placeholders} placeholder(s) like "[your result]" still to fill in before posting.` });
  }

  const lower = allText(c).toLowerCase();
  const banned = [...new Set([...DEFAULT_BANNED, ...extraBanned.map((b) => b.toLowerCase())])];
  const hits = banned.filter((b) => lower.includes(b));
  if (hits.length) w.push({ level: "warn", section: "all", message: `Sounds AI-written or off-voice: ${hits.map((h) => `"${h}"`).join(", ")}.` });

  if (c.format === "carousel") {
    c.slides.forEach((s, i) => {
      if ((s.stat || (s.layout === "stat" && /\d/.test(s.title + s.body))) && !s.source) {
        w.push({ level: "error", section: "slides", message: `Slide ${i + 1} shows a number with no source. Add one or remove the number.` });
      }
    });
    c.slides.forEach((s, i) => {
      if (s.layout === "image" && !s.image) w.push({ level: "error", section: "slides", message: `Slide ${i + 1} uses the image layout but has no image. Pick one or change the layout.` });
    });
    if (c.slides[0]?.layout !== "cover") w.push({ level: "warn", section: "slides", message: "First slide should be a cover (the hook)." });
    if (c.slides.at(-1)?.layout !== "cta") w.push({ level: "warn", section: "slides", message: "Last slide should be a call to action." });
  }

  if (c.format === "video") {
    const total = c.beats.reduce((n, b) => n + b.seconds, 0);
    if (Math.abs(total - c.targetSeconds) > c.targetSeconds * 0.25) {
      w.push({ level: "warn", section: "script", message: `Beats add up to ${total}s, target is ${c.targetSeconds}s.` });
    }
    const words = c.teleprompter.split(/\s+/).filter(Boolean).length;
    const spoken = Math.round(words / WORDS_PER_SECOND);
    if (spoken > c.targetSeconds * 1.25) {
      w.push({ level: "warn", section: "script", message: `Teleprompter is ~${spoken}s at a normal pace (${words} words), longer than the ${c.targetSeconds}s target.` });
    }
  }
  return w;
}

// Pure functions: used by both the server and the browser.
import { countPlaceholders, DEFAULT_BANNED, type DraftWarning } from "../drafts/checks";
import { LIMITS, type ProfileContent } from "./schema";

/** Words recruiters search for; at least one should be in the chosen headline. */
export const RECRUITER_KEYWORDS = ["frontend", "front-end", "flutter", "developer", "engineer", "web", "mobile", "automation"];

/** Every text value in the profile (not JSON syntax, whose [ ] would look like placeholders). */
export function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
}

const USERNAME_RE = /^[a-z0-9._]{1,30}$/;
const URL_SLUG_RE = /^[a-z0-9-]{3,100}$/;

export function checkProfile(
  c: ProfileContent,
  selected: { headline: number; bio: number },
  extraBanned: string[] = [],
): DraftWarning[] {
  const w: DraftWarning[] = [];
  const add = (level: DraftWarning["level"], section: string, message: string) => w.push({ level, section, message });

  c.linkedin.headlines.forEach((h, i) => {
    if (h.length > LIMITS.linkedinHeadline) add("error", "headline", `Headline option ${i + 1} is ${h.length}/${LIMITS.linkedinHeadline} characters.`);
  });
  const headline = c.linkedin.headlines[selected.headline] ?? c.linkedin.headlines[0];
  if (!RECRUITER_KEYWORDS.some((k) => headline.toLowerCase().includes(k))) {
    add("warn", "headline", "The chosen headline has no job-title words (e.g. Frontend, Flutter, Developer). Recruiters search by these.");
  }

  const about = c.linkedin.about;
  if (about.length > LIMITS.linkedinAbout) add("error", "about", `About is ${about.length}/${LIMITS.linkedinAbout} characters.`);
  const firstPara = about.split(/\n\s*\n/)[0];
  if (firstPara.length > LIMITS.linkedinAboutFold) {
    add("warn", "about", `The first paragraph is ${firstPara.length} characters; only about the first ${LIMITS.linkedinAboutFold} show before "see more". Lead with a short hook.`);
  }
  if (!/book|call|calendly|cal\.com/i.test(about)) add("warn", "about", "About doesn't ask people to book a call.");
  if (!/open to|freelance|contract|full-time|full time/i.test(about)) add("warn", "about", "About doesn't say you're open to freelance, contract or full-time work.");

  c.linkedin.experience.forEach((e, i) => {
    if (e.description.length > LIMITS.linkedinExperience) add("error", "experience", `Experience ${i + 1} description is ${e.description.length}/${LIMITS.linkedinExperience} characters.`);
  });
  if (c.linkedin.customUrl && !URL_SLUG_RE.test(c.linkedin.customUrl)) {
    add("warn", "linkedinExtras", "Custom URL can only use letters, numbers and hyphens (3–100 characters).");
  }

  c.instagram.bios.forEach((b, i) => {
    if (b.length > LIMITS.instagramBio) add("error", "instagramBio", `Bio option ${i + 1} is ${b.length}/${LIMITS.instagramBio} characters.`);
  });
  const bio = c.instagram.bios[selected.bio] ?? c.instagram.bios[0];
  if (!/book|call|link|👇|⬇/i.test(bio)) add("warn", "instagramBio", "The chosen bio has no call to action (e.g. \"Book a call 👇\").");
  if (c.instagram.name.length > LIMITS.instagramName) add("warn", "instagramBio", `Name field is ${c.instagram.name.length} characters; aim for ${LIMITS.instagramName} or fewer.`);
  c.instagram.usernames.forEach((u) => {
    if (!USERNAME_RE.test(u.replace(/^@/, ""))) add("warn", "instagramBio", `Username "${u}" isn't valid: lowercase letters, numbers, "." and "_" only, max 30.`);
  });
  c.instagram.highlights.forEach((h) => {
    if (h.name.length > LIMITS.instagramHighlight) add("warn", "instagramExtras", `Highlight "${h.name}" will be cut off; keep names to about ${LIMITS.instagramHighlight} characters.`);
  });
  if (!c.instagram.linkInBio.some((l) => /book|call/i.test(l.label))) add("warn", "instagramExtras", "Link in bio should include your booking link.");

  // Consistency: both platforms should pitch the same services.
  const services = ["web", "flutter", "automation"];
  const missingOnIg = services.filter((s) => headline.toLowerCase().includes(s) && !(bio + " " + c.instagram.name).toLowerCase().includes(s));
  if (missingOnIg.length) add("warn", "instagramBio", `LinkedIn mentions ${missingOnIg.join(", ")} but the chosen Instagram bio doesn't. Keep both consistent.`);

  const all = allStrings(c).join("\n");
  const gaps = countPlaceholders(all);
  if (gaps) add("warn", "all", `${gaps} placeholder(s) like "[booking link]" to fill in before pasting.`);
  const lower = all.toLowerCase();
  const hits = [...new Set([...DEFAULT_BANNED, ...extraBanned])].filter((b) => lower.includes(b));
  if (hits.length) add("warn", "all", `Sounds AI-written or off-voice: ${hits.map((h) => `"${h}"`).join(", ")}.`);
  return w;
}

/** One-time setup steps for bare accounts, in a sensible order. Stored as done/not done. */
export const SETUP_CHECKLIST: { id: string; platform: "LinkedIn" | "Instagram" | "Both"; text: string }[] = [
  { id: "photo", platform: "Both", text: "Same clear, friendly headshot on both (face fills most of the circle, plain background)." },
  { id: "booking", platform: "Both", text: "Create a free booking page (Cal.com, Calendly or Google Calendar) and add the link to your knowledge base." },
  { id: "li-headline", platform: "LinkedIn", text: "Paste your chosen headline." },
  { id: "li-about", platform: "LinkedIn", text: "Paste the About section." },
  { id: "li-experience", platform: "LinkedIn", text: "Add the OI.Dev experience entry (and past roles)." },
  { id: "li-skills", platform: "LinkedIn", text: "Add skills; put the most important ones first." },
  { id: "li-featured", platform: "LinkedIn", text: "Featured: booking link first, then portfolio, then your best post." },
  { id: "li-contact", platform: "LinkedIn", text: "Contact info → Website: booking page or portfolio." },
  { id: "li-url", platform: "LinkedIn", text: "Set your custom profile URL." },
  { id: "li-otw", platform: "LinkedIn", text: "Open to work → choose job titles and set visibility to recruiters only." },
  { id: "li-banner", platform: "LinkedIn", text: "Banner 1584×396 with the bottom-left kept clear for your photo (the tool will render one in a later stage)." },
  { id: "ig-pro", platform: "Instagram", text: "Switch to a Professional account → Business (needed later for API posting). Pick a category such as Software or Web designer." },
  { id: "ig-name", platform: "Instagram", text: "Set the name field (it's searchable) and username." },
  { id: "ig-bio", platform: "Instagram", text: "Paste your chosen bio and add the link in bio." },
  { id: "ig-button", platform: "Instagram", text: "Optional: add a booking action button if your booking tool is a supported partner (check in the app)." },
  { id: "ig-pinned", platform: "Instagram", text: "Publish the 3 pinned posts (services, proof/process, about you) and pin them before promoting the profile." },
  { id: "ig-highlights", platform: "Instagram", text: "Post a few stories and save them into highlights with on-brand covers." },
  { id: "launch", platform: "Both", text: "Publish your launch post on both platforms." },
];

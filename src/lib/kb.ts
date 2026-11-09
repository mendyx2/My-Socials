import { KB_DEFAULTS } from "./kb-defaults.generated";
import { getStorage, type Storage } from "./storage";

/** The knowledge-base files the tool reads. Only these can be edited from the UI. */
export const KB_FILES = ["about.md", "pillars.md", "brand.md", "voice.md", "updates.md"] as const;
export type KbFile = (typeof KB_FILES)[number];

export type KnowledgeBase = Record<KbFile, string>;

export function isKbFile(name: string): name is KbFile {
  return (KB_FILES as readonly string[]).includes(name);
}

const key = (name: KbFile) => `profile/${name}`;

/**
 * Saved content wins. If a file was never saved here (e.g. a brand-new hosted site),
 * start from the version in the repo's profile/ folder that was baked in at build time.
 */
export async function readKbFile(name: KbFile, storage?: Storage, defaults: Record<string, string> = KB_DEFAULTS): Promise<string> {
  const saved = await (storage ?? (await getStorage())).getText(key(name));
  return saved ?? defaults[name] ?? "";
}

export async function writeKbFile(name: KbFile, content: string, storage?: Storage): Promise<void> {
  if (!isKbFile(name)) throw new Error(`Not a knowledge-base file: ${name}`);
  await (storage ?? (await getStorage())).setText(key(name), content);
}

export async function loadKnowledgeBase(storage?: Storage, defaults?: Record<string, string>): Promise<KnowledgeBase> {
  const s = storage ?? (await getStorage());
  const entries = await Promise.all(KB_FILES.map(async (f) => [f, await readKbFile(f, s, defaults)] as const));
  return Object.fromEntries(entries) as KnowledgeBase;
}

/** Compact text block for prompts. Strips HTML comments and collapses blank lines. */
export function kbToPrompt(kb: KnowledgeBase): string {
  return KB_FILES.map((f) => {
    const body = kb[f]
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return body ? `### ${f}\n${body}` : "";
  })
    .filter(Boolean)
    .join("\n\n");
}

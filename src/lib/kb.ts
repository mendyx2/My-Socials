import { promises as fs } from "node:fs";
import path from "node:path";
import { PROFILE_DIR } from "./paths";

/** The knowledge-base files the tool reads. Only these can be edited from the UI. */
export const KB_FILES = ["about.md", "pillars.md", "brand.md", "voice.md", "updates.md"] as const;
export type KbFile = (typeof KB_FILES)[number];

export type KnowledgeBase = Record<KbFile, string>;

export function isKbFile(name: string): name is KbFile {
  return (KB_FILES as readonly string[]).includes(name);
}

export async function readKbFile(name: KbFile, dir = PROFILE_DIR): Promise<string> {
  try {
    return await fs.readFile(path.join(dir, name), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

export async function writeKbFile(name: KbFile, content: string, dir = PROFILE_DIR): Promise<void> {
  if (!isKbFile(name)) throw new Error(`Not a knowledge-base file: ${name}`);
  await fs.writeFile(path.join(dir, name), content, "utf8");
}

export async function loadKnowledgeBase(dir = PROFILE_DIR): Promise<KnowledgeBase> {
  const entries = await Promise.all(KB_FILES.map(async (f) => [f, await readKbFile(f, dir)] as const));
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

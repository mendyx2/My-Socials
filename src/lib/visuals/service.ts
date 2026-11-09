import { promises as fs } from "node:fs";
import path from "node:path";
import { NotFoundError } from "../drafts/service";
import { DraftStore } from "../drafts/store";
import { ProfileStore } from "../profiles/service";
import { listRendered, renderCarousel, renderProfileVisuals, RENDERS_DIR, type RenderedFile } from "./render";
import { loadTheme } from "./theme";

export interface RenderedView extends RenderedFile {
  url: string;
}

const view = (files: RenderedFile[]): RenderedView[] => {
  const v = Date.now(); // cache-buster so re-renders show up
  return files.map((f) => ({ ...f, url: `/api/renders/${f.rel}?v=${v}` }));
};

export async function renderDraftVisuals(id: string): Promise<RenderedView[]> {
  const draft = await new DraftStore().get(id);
  if (!draft) throw new NotFoundError(`Draft not found: ${id}`);
  if (draft.content.format !== "carousel") throw new Error("Only carousel drafts have slides to render.");
  return view(await renderCarousel(draft.id, draft.content, await loadTheme()));
}

export async function renderProfileVersionVisuals(id: string): Promise<RenderedView[]> {
  const version = await new ProfileStore().get(id);
  return view(await renderProfileVisuals(version.id, version.content, await loadTheme()));
}

export async function existingVisuals(kind: "drafts" | "profile", id: string): Promise<RenderedView[]> {
  if (!/^[\w-]+$/.test(id)) return [];
  return view(await listRendered(`${kind}/${id}`));
}

const TYPES: Record<string, string> = { ".png": "image/png", ".pdf": "application/pdf" };

/** Reads a rendered file, refusing anything outside the renders folder. */
export async function readRendered(parts: string[]): Promise<{ data: Buffer; type: string; name: string }> {
  const full = path.resolve(RENDERS_DIR, ...parts);
  if (!full.startsWith(RENDERS_DIR + path.sep)) throw new NotFoundError("Not found");
  const type = TYPES[path.extname(full)];
  if (!type) throw new NotFoundError("Not found");
  try {
    return { data: await fs.readFile(full), type, name: path.basename(full) };
  } catch {
    throw new NotFoundError("Not found");
  }
}

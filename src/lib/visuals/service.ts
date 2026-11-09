import { promises as fs } from "node:fs";
import path from "node:path";
import { NotFoundError } from "../drafts/service";
import { DraftStore } from "../drafts/store";
import { MediaStore } from "../media/store";
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
  // Embed slide images so rendering never needs the network.
  const media = new MediaStore();
  const images: Record<string, string> = {};
  for (const id of new Set(draft.content.slides.map((s) => s.image).filter(Boolean))) {
    images[id] = await media.dataUrl(id).catch(() => "");
  }
  return view(await renderCarousel(draft.id, draft.content, await loadTheme(), images));
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

/** Renders a carousel fresh and packs the PNGs + PDF into one ZIP. */
export async function carouselZip(id: string): Promise<{ data: Uint8Array; filename: string; warnings: string[] }> {
  const { zipSync } = await import("fflate");
  const files = await renderDraftVisuals(id);
  const draft = (await new DraftStore().get(id))!;
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const f of files) {
    // PNG and PDF are already compressed; store them as-is.
    entries[f.name] = [new Uint8Array(await fs.readFile(path.join(RENDERS_DIR, f.rel))), { level: 0 }];
  }
  const slug = draft.ideaTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "carousel";
  return { data: zipSync(entries), filename: `${slug}.zip`, warnings: files.map((f) => f.warning).filter((w): w is string => !!w) };
}

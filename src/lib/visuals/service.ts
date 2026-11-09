import { NotFoundError } from "../drafts/service";
import { DraftStore } from "../drafts/store";
import { MediaStore } from "../media/store";
import { ProfileStore } from "../profiles/service";
import { getStorage } from "../storage";
import { listRendered, renderCarousel, renderProfileVisuals, RENDERS_PREFIX, type RenderedFile } from "./render";
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

const TYPES: Record<string, string> = { png: "image/png", pdf: "application/pdf" };

/** Netlify functions can't return much more than ~6 MB, so bigger files are refused with a clear message. */
export const MAX_RESPONSE_BYTES = 5.5 * 1024 * 1024;

/** Reads a rendered file. Only renders/… keys, only PNG or PDF. */
export async function readRendered(parts: string[]): Promise<{ data: Uint8Array; type: string; name: string }> {
  const rel = parts.join("/");
  const ext = rel.split(".").pop() ?? "";
  if (!TYPES[ext] || !/^(drafts|profile)\/[\w-]+\/[\w.-]+$/.test(rel)) throw new NotFoundError("Not found");
  const data = await (await getStorage()).getBytes(`${RENDERS_PREFIX}/${rel}`);
  if (!data) throw new NotFoundError("Not found");
  if (data.byteLength > MAX_RESPONSE_BYTES) throw new Error("This file is too large to download from the hosted app. Render it on your laptop instead.");
  return { data, type: TYPES[ext], name: rel.split("/").pop()! };
}

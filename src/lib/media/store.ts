import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NotFoundError } from "../drafts/service";
import { getStorage, type Storage } from "../storage";

/**
 * Images are stored under media/ (files on your computer; Netlify Blobs when hosted).
 * Hosted uploads must stay under Netlify's ~6 MB request limit, so the browser shrinks
 * big photos before uploading; this is the hard cap.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const LIBRARY = "media/library.json";
const fileKey = (file: string) => `media/files/${file}`;

export const MEDIA_KINDS = ["inspiration", "storyboard", "photo"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

const TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;
export type ImageMime = keyof typeof TYPES;

export interface MediaItem {
  id: string;
  file: string; // file name inside media/files
  mime: ImageMime;
  bytes: number;
  originalName: string;
  title: string;
  notes: string;
  kind: MediaKind;
  createdAt: string;
}

export interface Board {
  id: string;
  name: string;
  notes: string;
  /** Ordered frames. The same image can appear in several boards. */
  itemIds: string[];
  createdAt: string;
}

interface Library {
  items: MediaItem[];
  boards: Board[];
}

/** Checks the file's first bytes, not just its name or browser-reported type. */
export function sniffImage(buf: Uint8Array): ImageMime | null {
  const b = (i: number) => buf[i];
  if (buf.length >= 8 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (buf.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (buf.length >= 12 && String.fromCharCode(...buf.slice(0, 4)) === "RIFF" && String.fromCharCode(...buf.slice(8, 12)) === "WEBP") return "image/webp";
  if (buf.length >= 6 && String.fromCharCode(...buf.slice(0, 4)) === "GIF8") return "image/gif";
  return null;
}

export const ItemPatchSchema = z.object({
  title: z.string().trim().max(120).optional(),
  notes: z.string().max(2000).optional(),
  kind: z.enum(MEDIA_KINDS).optional(),
});

export const BoardPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  notes: z.string().max(2000).optional(),
  itemIds: z.array(z.string()).max(200).optional(),
  /** Appended on the server, so quick successive adds can't overwrite each other. */
  addItemIds: z.array(z.string()).max(50).optional(),
});

export class MediaStore {
  constructor(private readonly storage?: Storage) {}
  private s() {
    return this.storage ? Promise.resolve(this.storage) : getStorage();
  }

  async read(): Promise<Library> {
    const lib = await (await this.s()).getJSON<Partial<Library>>(LIBRARY, {});
    return { items: lib.items ?? [], boards: lib.boards ?? [] };
  }

  private async mutate<R>(fn: (lib: Library) => R): Promise<R> {
    return (await this.s()).mutateJSON<Library, R>(LIBRARY, { items: [], boards: [] }, (lib) => {
      lib.items ??= [];
      lib.boards ??= [];
      return fn(lib);
    });
  }

  async get(id: string): Promise<MediaItem> {
    const item = (await this.read()).items.find((i) => i.id === id);
    if (!item) throw new NotFoundError(`Image not found: ${id}`);
    return item;
  }

  async add(input: { data: Uint8Array; originalName: string; kind?: MediaKind; title?: string; notes?: string }, now = new Date()): Promise<MediaItem> {
    if (input.data.byteLength === 0) throw new Error("The file is empty.");
    if (input.data.byteLength > MAX_UPLOAD_BYTES) throw new Error(`"${input.originalName}" is over 5 MB.`);
    const mime = sniffImage(input.data);
    if (!mime) throw new Error(`"${input.originalName}" isn't a PNG, JPEG, WebP or GIF image.`);
    const id = randomUUID();
    const file = `${id}.${TYPES[mime]}`;
    await (await this.s()).setBytes(fileKey(file), input.data);
    const item: MediaItem = {
      id,
      file,
      mime,
      bytes: input.data.byteLength,
      originalName: input.originalName.slice(0, 200),
      title: (input.title ?? input.originalName.replace(/\.[a-z0-9]+$/i, "")).slice(0, 120),
      notes: (input.notes ?? "").slice(0, 2000),
      kind: input.kind ?? "inspiration",
      createdAt: now.toISOString(),
    };
    await this.mutate((lib) => {
      lib.items.unshift(item);
    });
    return item;
  }

  async update(id: string, patch: z.infer<typeof ItemPatchSchema>): Promise<MediaItem> {
    const p = ItemPatchSchema.parse(patch);
    return this.mutate((lib) => {
      const i = lib.items.findIndex((x) => x.id === id);
      if (i === -1) throw new NotFoundError(`Image not found: ${id}`);
      lib.items[i] = { ...lib.items[i], ...p };
      return lib.items[i];
    });
  }

  /** Deletes the image and removes it from every board. */
  async remove(id: string): Promise<void> {
    const removed = await this.mutate((lib) => {
      const item = lib.items.find((x) => x.id === id);
      lib.items = lib.items.filter((x) => x.id !== id);
      lib.boards = lib.boards.map((b) => ({ ...b, itemIds: b.itemIds.filter((x) => x !== id) }));
      return item;
    });
    if (removed) await (await this.s()).delete(fileKey(removed.file));
  }

  async fileOf(id: string): Promise<{ item: MediaItem; data: Buffer }> {
    const item = await this.get(id);
    const data = await (await this.s()).getBytes(fileKey(item.file));
    if (!data) throw new NotFoundError(`Image file missing: ${id}`);
    return { item, data: Buffer.from(data) };
  }

  async dataUrl(id: string): Promise<string> {
    const { item, data } = await this.fileOf(id);
    return `data:${item.mime};base64,${data.toString("base64")}`;
  }

  async addBoard(name: string, notes = "", now = new Date()): Promise<Board> {
    const board: Board = { id: randomUUID(), name: name.trim().slice(0, 80) || "Untitled board", notes: notes.slice(0, 2000), itemIds: [], createdAt: now.toISOString() };
    await this.mutate((lib) => {
      lib.boards.unshift(board);
    });
    return board;
  }

  async updateBoard(id: string, patch: z.infer<typeof BoardPatchSchema>): Promise<Board> {
    const p = BoardPatchSchema.parse(patch);
    return this.mutate((lib) => {
      const i = lib.boards.findIndex((b) => b.id === id);
      if (i === -1) throw new NotFoundError(`Board not found: ${id}`);
      const known = new Set(lib.items.map((x) => x.id));
      const base = p.itemIds ?? lib.boards[i].itemIds;
      const itemIds = [...new Set([...base, ...(p.addItemIds ?? [])])].filter((x) => known.has(x)).slice(0, 200);
      const { addItemIds: _added, ...rest } = p;
      lib.boards[i] = { ...lib.boards[i], ...rest, itemIds };
      return lib.boards[i];
    });
  }

  async removeBoard(id: string): Promise<void> {
    await this.mutate((lib) => {
      lib.boards = lib.boards.filter((b) => b.id !== id);
    });
  }
}

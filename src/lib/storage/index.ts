import { promises as fs } from "node:fs";
import path from "node:path";
import { withFileLock } from "../json-file";
import { ROOT } from "../paths";

/**
 * Where the tool keeps everything: ideas, drafts, profiles, knowledge base, images, renders.
 * Keys look like paths ("data/ideas.json", "media/files/x.png"), so the local layout on disk
 * is exactly what you'd expect, and the same keys work in Netlify Blobs when hosted.
 */
export interface Storage {
  readonly kind: "file" | "netlify";
  getText(key: string): Promise<string | null>;
  setText(key: string, text: string): Promise<void>;
  getJSON<T>(key: string, fallback: T): Promise<T>;
  setJSON(key: string, value: unknown): Promise<void>;
  /**
   * Safe read-modify-write. `fn` gets a fresh copy of the data, may change it in place, and
   * returns a result. Overlapping calls never overwrite each other. `fn` can run more than
   * once (when hosted, on a conflict), so it must not have side effects outside `data`.
   */
  mutateJSON<T, R>(key: string, fallback: T, fn: (data: T) => R | Promise<R>): Promise<R>;
  getBytes(key: string): Promise<Uint8Array | null>;
  setBytes(key: string, data: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  /** Keys under a prefix ("renders/drafts/abc/"), sorted. */
  list(prefix: string): Promise<string[]>;
  deletePrefix(prefix: string): Promise<void>;
}

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/;
export function assertKey(key: string): void {
  if (!KEY_RE.test(key) || key.includes("..") || key.includes("//") || key.length > 300) {
    throw new Error(`Invalid storage key: ${key}`);
  }
}

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/* ---------------- files on this computer ---------------- */

export class FileStorage implements Storage {
  readonly kind = "file" as const;
  constructor(private readonly root: string = ROOT) {}

  private file(key: string): string {
    assertKey(key);
    return path.join(/*turbopackIgnore: true*/ this.root, key);
  }

  async getText(key: string): Promise<string | null> {
    try {
      return await fs.readFile(this.file(key), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async setText(key: string, text: string): Promise<void> {
    await this.writeAtomic(this.file(key), text);
  }

  async getJSON<T>(key: string, fallback: T): Promise<T> {
    const text = await this.getText(key);
    return text === null ? clone(fallback) : (JSON.parse(text) as T);
  }

  async setJSON(key: string, value: unknown): Promise<void> {
    await this.setText(key, JSON.stringify(value, null, 2) + "\n");
  }

  mutateJSON<T, R>(key: string, fallback: T, fn: (data: T) => R | Promise<R>): Promise<R> {
    return withFileLock(this.file(key), async () => {
      const data = await this.getJSON(key, fallback);
      const result = await fn(data);
      await this.setJSON(key, data);
      return result;
    });
  }

  async getBytes(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await fs.readFile(this.file(key)));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async setBytes(key: string, data: Uint8Array): Promise<void> {
    await this.writeAtomic(this.file(key), data);
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.file(key), { force: true });
  }

  async list(prefix: string): Promise<string[]> {
    const dir = prefix.endsWith("/") ? prefix.slice(0, -1) : path.posix.dirname(prefix);
    if (dir && dir !== ".") assertKey(dir);
    const base = path.join(/*turbopackIgnore: true*/ this.root, dir === "." ? "" : dir);
    const out: string[] = [];
    const walk = async (abs: string, rel: string) => {
      const entries = await fs.readdir(abs, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(path.join(abs, e.name), r);
        else if (!e.name.endsWith(".tmp")) out.push(r);
      }
    };
    await walk(base, dir === "." ? "" : dir);
    return out.filter((k) => k.startsWith(prefix)).sort();
  }

  async deletePrefix(prefix: string): Promise<void> {
    await Promise.all((await this.list(prefix)).map((k) => this.delete(k)));
  }

  /** Temp file + rename, so a crash never leaves a half-written file. */
  private async writeAtomic(file: string, data: string | Uint8Array): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, file);
  }
}

/* ---------------- Netlify Blobs (hosted) ---------------- */

type BlobStore = import("@netlify/blobs").Store;

export class NetlifyBlobStorage implements Storage {
  readonly kind = "netlify" as const;
  constructor(private readonly store: BlobStore) {}

  async getText(key: string): Promise<string | null> {
    assertKey(key);
    return (await this.store.get(key, { type: "text" })) ?? null;
  }

  async setText(key: string, text: string): Promise<void> {
    assertKey(key);
    await this.store.set(key, text);
  }

  async getJSON<T>(key: string, fallback: T): Promise<T> {
    assertKey(key);
    const v = await this.store.get(key, { type: "json" });
    return v === null || v === undefined ? clone(fallback) : (v as T);
  }

  async setJSON(key: string, value: unknown): Promise<void> {
    assertKey(key);
    await this.store.setJSON(key, value);
  }

  /**
   * Two layers of protection:
   * 1. An in-process lock, so quick successive requests on the same server instance queue up.
   * 2. Optimistic concurrency across instances: write only if the blob still has the version
   *    (etag) we read; otherwise re-read and retry. Where no etag is available (some API-mode
   *    clients), it falls back to a plain write.
   */
  mutateJSON<T, R>(key: string, fallback: T, fn: (data: T) => R | Promise<R>): Promise<R> {
    assertKey(key);
    return withFileLock(`blobs:${key}`, async () => {
      for (let attempt = 0; attempt < 12; attempt++) {
        const current = await this.store.getWithMetadata(key, { type: "json" });
        const data = current ? (current.data as T) : clone(fallback);
        const result = await fn(data);
        const write = !current
          ? await this.store.setJSON(key, data, { onlyIfNew: true })
          : current.etag
            ? await this.store.setJSON(key, data, { onlyIfMatch: current.etag })
            : await this.store.setJSON(key, data);
        if (write.modified) return result;
        await new Promise((r) => setTimeout(r, 30 * (attempt + 1) + Math.random() * 80));
      }
      throw new Error(`Couldn't save "${key}" because it kept changing. Please try again.`);
    });
  }

  async getBytes(key: string): Promise<Uint8Array | null> {
    assertKey(key);
    const buf = await this.store.get(key, { type: "arrayBuffer" });
    return buf ? new Uint8Array(buf) : null;
  }

  async setBytes(key: string, data: Uint8Array): Promise<void> {
    assertKey(key);
    // Copy into a standalone ArrayBuffer (Blob input can't be a view on shared memory).
    await this.store.set(key, data.slice().buffer as ArrayBuffer);
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    await this.store.delete(key);
  }

  /** Lists everything and filters here: prefix filtering isn't reliable in every Blobs environment. */
  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    for await (const page of this.store.list({ paginate: true })) {
      for (const b of page.blobs) if (b.key.startsWith(prefix)) keys.push(b.key);
    }
    return keys.sort();
  }

  async deletePrefix(prefix: string): Promise<void> {
    await Promise.all((await this.list(prefix)).map((k) => this.store.delete(k)));
  }
}

/* ---------------- choosing one ---------------- */

export const BLOB_STORE_NAME = "my-socials";

type Env = Record<string, string | undefined>;

/** Hosted on Netlify, or a script/GitHub Action that was given Netlify credentials. */
export function wantsNetlify(env: Env = process.env): boolean {
  if (env.STORAGE === "file") return false;
  return (
    env.STORAGE === "netlify" ||
    !!env.NETLIFY_BLOBS_CONTEXT ||
    (!!env.NETLIFY && !!env.SITE_ID && !!env.DEPLOY_ID) ||
    (env === process.env && !!(globalThis as { netlifyBlobsContext?: unknown }).netlifyBlobsContext)
  );
}

/**
 * fetch for the Blobs client. Inside Next.js, the library's `response.body.cancel()` (called on
 * every 404, i.e. any key that doesn't exist yet) never settles, which froze pages. Reading each
 * response fully and returning a fresh copy avoids that. no-store keeps Next.js from caching.
 */
export const blobsFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, { ...init, cache: "no-store" });
  const body = res.status === 204 || res.status === 304 || init?.method?.toUpperCase() === "HEAD" ? null : await res.arrayBuffer();
  return new Response(body && body.byteLength ? body : null, { status: res.status, statusText: res.statusText, headers: res.headers });
};

export async function createNetlifyStorage(env: Env = process.env): Promise<NetlifyBlobStorage> {
  const { getStore } = await import("@netlify/blobs");
  // Inside Netlify functions the context is automatic. Scripts and GitHub Actions pass a site ID + token.
  const explicit =
    env.NETLIFY_SITE_ID && env.NETLIFY_AUTH_TOKEN
      ? {
          siteID: env.NETLIFY_SITE_ID,
          token: env.NETLIFY_AUTH_TOKEN,
          ...(env.NETLIFY_BLOBS_API_URL ? { apiURL: env.NETLIFY_BLOBS_API_URL } : {}),
        }
      : {};
  return new NetlifyBlobStorage(getStore({ name: BLOB_STORE_NAME, consistency: "strong", fetch: blobsFetch, ...explicit }));
}

let current: Promise<Storage> | null = null;

/** The storage for this process: files locally, Netlify Blobs when hosted. */
export function getStorage(): Promise<Storage> {
  current ??= wantsNetlify() ? createNetlifyStorage() : Promise.resolve(new FileStorage());
  return current;
}

/** For tests and scripts. */
export function setStorage(s: Storage | null): void {
  current = s ? Promise.resolve(s) : null;
}

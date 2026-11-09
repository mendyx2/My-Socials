import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BlobsServer } from "@netlify/blobs/server";
import { createNetlifyStorage, FileStorage, wantsNetlify, type Storage } from "@/src/lib/storage";

let server: BlobsServer;
let blobs: Storage;

beforeAll(async () => {
  server = new BlobsServer({ directory: mkdtempSync(path.join(tmpdir(), "blobs-")), token: "test-token" });
  const { port } = await server.start();
  blobs = await createNetlifyStorage({ NETLIFY_SITE_ID: "site-1", NETLIFY_AUTH_TOKEN: "test-token", NETLIFY_BLOBS_API_URL: `http://localhost:${port}` });
});
afterAll(async () => server?.stop());

const backends: [string, () => Storage][] = [
  ["files", () => new FileStorage(mkdtempSync(path.join(tmpdir(), "fs-")))],
  ["netlify blobs", () => blobs],
];

describe.each(backends)("%s storage", (_name, make) => {
  it("round-trips text, JSON and bytes, with fallbacks for missing keys", async () => {
    const s = make();
    const p = `t${Math.random().toString(36).slice(2)}`;
    expect(await s.getText(`${p}/a.md`)).toBeNull();
    expect(await s.getJSON(`${p}/x.json`, { ideas: [] })).toEqual({ ideas: [] });
    await s.setText(`${p}/a.md`, "# Hi\nÜnïcödé ✓");
    expect(await s.getText(`${p}/a.md`)).toBe("# Hi\nÜnïcödé ✓");
    await s.setJSON(`${p}/x.json`, { n: 1 });
    expect(await s.getJSON(`${p}/x.json`, {})).toEqual({ n: 1 });
    const bytes = Uint8Array.from([0, 1, 2, 250, 255]);
    await s.setBytes(`${p}/media/files/a.png`, bytes);
    expect(Array.from((await s.getBytes(`${p}/media/files/a.png`))!)).toEqual([0, 1, 2, 250, 255]);
    expect(await s.getBytes(`${p}/nope.png`)).toBeNull();
  });

  it("lists and deletes by prefix", async () => {
    const s = make();
    const p = `l${Math.random().toString(36).slice(2)}`;
    await s.setText(`${p}/renders/d1/slide-02.png`, "b");
    await s.setText(`${p}/renders/d1/slide-01.png`, "a");
    await s.setText(`${p}/renders/d2/slide-01.png`, "c");
    expect(await s.list(`${p}/renders/d1/`)).toEqual([`${p}/renders/d1/slide-01.png`, `${p}/renders/d1/slide-02.png`]);
    await s.deletePrefix(`${p}/renders/d1/`);
    expect(await s.list(`${p}/renders/d1/`)).toEqual([]);
    expect(await s.list(`${p}/renders/`)).toEqual([`${p}/renders/d2/slide-01.png`]);
    await s.delete(`${p}/renders/d2/slide-01.png`);
    expect(await s.getText(`${p}/renders/d2/slide-01.png`)).toBeNull();
  });

  it("never loses an update when many happen at once", async () => {
    const s = make();
    const key = `c${Math.random().toString(36).slice(2)}/counter.json`;
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        s.mutateJSON(key, { items: [] as number[] }, (d) => {
          d.items.push(i);
        }),
      ),
    );
    const { items } = await s.getJSON(key, { items: [] as number[] });
    expect(items.sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });

  it("doesn't write when the update throws", async () => {
    const s = make();
    const key = `e${Math.random().toString(36).slice(2)}/x.json`;
    await s.setJSON(key, { v: 1 });
    await expect(s.mutateJSON(key, { v: 0 }, (d) => { d.v = 2; throw new Error("nope"); })).rejects.toThrow("nope");
    expect(await s.getJSON(key, {})).toEqual({ v: 1 });
  });

  it("rejects keys that could escape the store", async () => {
    const s = make();
    await expect(s.getText("../etc/passwd")).rejects.toThrow(/Invalid storage key/);
    await expect(s.setText("data/../../x", "y")).rejects.toThrow(/Invalid storage key/);
    await expect(s.getText("/abs")).rejects.toThrow(/Invalid storage key/);
  });
});

describe("choosing storage", () => {
  it("uses files by default and Netlify when hosted or told to", () => {
    expect(wantsNetlify({})).toBe(false);
    expect(wantsNetlify({ NETLIFY_BLOBS_CONTEXT: "abc" })).toBe(true);
    expect(wantsNetlify({ STORAGE: "netlify" })).toBe(true);
    expect(wantsNetlify({ STORAGE: "file", NETLIFY_BLOBS_CONTEXT: "abc" })).toBe(false);
  });
});

describe("Netlify optimistic concurrency (simulated store that enforces etags)", () => {
  it("retries on a stale version and keeps both updates", async () => {
    const { NetlifyBlobStorage } = await import("@/src/lib/storage");
    let value: unknown = { items: [] };
    let version = 1;
    let rejected = 0;
    let interfered = false;
    const fake = {
      async getWithMetadata() {
        const snapshot = { data: JSON.parse(JSON.stringify(value)), etag: `"v${version}"`, metadata: {} };
        // Another server instance writes right after our first read.
        if (!interfered) {
          interfered = true;
          value = { items: ["from-other-instance"] };
          version++;
        }
        return snapshot;
      },
      async setJSON(_k: string, data: unknown, opts: { onlyIfMatch?: string } = {}) {
        if (opts.onlyIfMatch && opts.onlyIfMatch !== `"v${version}"`) {
          rejected++;
          return { modified: false };
        }
        value = data;
        version++;
        return { modified: true, etag: `"v${version}"` };
      },
    };
    const s = new NetlifyBlobStorage(fake as never);
    await s.mutateJSON("data/x.json", { items: [] as string[] }, (d) => {
      d.items.push("mine");
    });
    expect(rejected).toBe(1);
    expect(value).toEqual({ items: ["from-other-instance", "mine"] });
  });
});

import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MediaStore, sniffImage } from "@/src/lib/media/store";
import { FileStorage } from "@/src/lib/storage";

// Smallest valid 1x1 PNG.
export const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const store = () => new MediaStore(new FileStorage(mkdtempSync(path.join(tmpdir(), "media-"))));

describe("media store", () => {
  it("detects real image types from bytes, not names", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(JPG)).toBe("image/jpeg");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("RIFF....WEBPVP8 "))).toBe("image/webp");
  });

  it("stores uploads with defaults and serves them back", async () => {
    const s = store();
    const item = await s.add({ data: PNG, originalName: "carousel-idea.png" });
    expect(item).toMatchObject({ title: "carousel-idea", kind: "inspiration", mime: "image/png", bytes: PNG.length });
    expect((await s.fileOf(item.id)).data.equals(Buffer.from(PNG))).toBe(true);
    expect(await s.dataUrl(item.id)).toMatch(/^data:image\/png;base64,/);
  });

  it("rejects non-images, empty and oversized files", async () => {
    const s = store();
    await expect(s.add({ data: new TextEncoder().encode("hello"), originalName: "evil.png" })).rejects.toThrow(/isn't a PNG/);
    await expect(s.add({ data: new Uint8Array(), originalName: "x.png" })).rejects.toThrow(/empty/);
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    await expect(s.add({ data: big, originalName: "big.png" })).rejects.toThrow(/over 5 MB/);
  });

  it("keeps storyboard frames ordered, unique and pointing at real images", async () => {
    const s = store();
    const a = await s.add({ data: PNG, originalName: "a.png", kind: "storyboard" });
    const b = await s.add({ data: JPG, originalName: "b.jpg", kind: "storyboard" });
    const board = await s.addBoard("Flutter Reel", "60s");
    const updated = await s.updateBoard(board.id, { itemIds: [b.id, a.id, b.id, "missing"] });
    expect(updated.itemIds).toEqual([b.id, a.id]);
    // Concurrent "add" requests both land.
    const c = await s.add({ data: PNG, originalName: "c.png" });
    const board2 = await s.addBoard("Two");
    await Promise.all([s.updateBoard(board2.id, { addItemIds: [a.id] }), s.updateBoard(board2.id, { addItemIds: [c.id] })]);
    expect((await s.read()).boards.find((x) => x.id === board2.id)!.itemIds.sort()).toEqual([a.id, c.id].sort());
  });

  it("deleting an image removes its file and its storyboard frames", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "media-"));
    const s = new MediaStore(new FileStorage(dir));
    const a = await s.add({ data: PNG, originalName: "a.png" });
    const board = await s.addBoard("B");
    await s.updateBoard(board.id, { itemIds: [a.id] });
    await s.remove(a.id);
    expect((await s.read()).boards[0].itemIds).toEqual([]);
    expect(existsSync(path.join(dir, "media", "files", a.file))).toBe(false);
    await expect(s.get(a.id)).rejects.toThrow(/not found/);
  });

  it("validates edits", async () => {
    const s = store();
    const a = await s.add({ data: PNG, originalName: "a.png" });
    expect((await s.update(a.id, { notes: "Love the big numbers", kind: "photo" })).kind).toBe("photo");
    await expect(s.update(a.id, { kind: "video" as never })).rejects.toThrow();
  });
});

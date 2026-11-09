import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadKnowledgeBase, readKbFile, writeKbFile } from "@/src/lib/kb";
import { KB_DEFAULTS } from "@/src/lib/kb-defaults.generated";
import { FileStorage } from "@/src/lib/storage";

describe("knowledge base on a fresh site", () => {
  it("starts from the repo's profile files, then uses what you save in the app", async () => {
    const s = new FileStorage(mkdtempSync(path.join(tmpdir(), "kb-")));
    expect(KB_DEFAULTS["about.md"]).toContain("Wendy");
    expect(await readKbFile("about.md", s)).toBe(KB_DEFAULTS["about.md"]);
    await writeKbFile("about.md", "Saved from my phone", s);
    expect(await readKbFile("about.md", s)).toBe("Saved from my phone");
    await writeKbFile("voice.md", "", s); // clearing a page in the app sticks
    expect((await loadKnowledgeBase(s))["voice.md"]).toBe("");
  });
});

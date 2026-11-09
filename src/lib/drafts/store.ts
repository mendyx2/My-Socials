import path from "node:path";
import { readJson, writeJson } from "../json-file";
import { DATA_DIR } from "../paths";
import { DRAFT_STATUSES, DraftContentSchema, type DraftContent, type DraftStatus, type StoredDraft } from "./schema";

export class DraftStore {
  constructor(private readonly dir = DATA_DIR) {}

  private get file() {
    return path.join(this.dir, "drafts.json");
  }

  async list(): Promise<StoredDraft[]> {
    return (await readJson<{ drafts: StoredDraft[] }>(this.file, { drafts: [] })).drafts;
  }

  async get(id: string): Promise<StoredDraft | undefined> {
    return (await this.list()).find((d) => d.id === id);
  }

  async put(draft: StoredDraft): Promise<StoredDraft> {
    const all = await this.list();
    const idx = all.findIndex((d) => d.id === draft.id);
    if (idx === -1) all.unshift(draft);
    else all[idx] = draft;
    await writeJson(this.file, { drafts: all });
    return draft;
  }

  /** Manual edits from the editor. Content is re-validated and can't change format. */
  async update(id: string, patch: { content?: DraftContent; status?: DraftStatus }, now = new Date()): Promise<StoredDraft> {
    const draft = await this.get(id);
    if (!draft) throw new Error(`Draft not found: ${id}`);
    if (patch.status && !DRAFT_STATUSES.includes(patch.status)) throw new Error(`Invalid status: ${patch.status}`);
    let content = draft.content;
    if (patch.content) {
      content = DraftContentSchema.parse(patch.content);
      if (content.format !== draft.content.format) throw new Error("A draft's format can't be changed");
    }
    return this.put({ ...draft, content, status: patch.status ?? draft.status, updatedAt: now.toISOString() });
  }

  async delete(id: string): Promise<void> {
    const all = await this.list();
    await writeJson(this.file, { drafts: all.filter((d) => d.id !== id) });
  }
}

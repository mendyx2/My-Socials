import { getStorage, type Storage } from "../storage";
import { DRAFT_STATUSES, DraftContentSchema, type DraftContent, type DraftStatus, type StoredDraft } from "./schema";

const DRAFTS = "data/drafts.json";
type File = { drafts: StoredDraft[] };

export class DraftStore {
  constructor(private readonly storage?: Storage) {}
  private s() {
    return this.storage ? Promise.resolve(this.storage) : getStorage();
  }

  async list(): Promise<StoredDraft[]> {
    return (await (await this.s()).getJSON<File>(DRAFTS, { drafts: [] })).drafts;
  }

  async get(id: string): Promise<StoredDraft | undefined> {
    return (await this.list()).find((d) => d.id === id);
  }

  async put(draft: StoredDraft): Promise<StoredDraft> {
    return (await this.s()).mutateJSON<File, StoredDraft>(DRAFTS, { drafts: [] }, (d) => {
      const idx = d.drafts.findIndex((x) => x.id === draft.id);
      if (idx === -1) d.drafts.unshift(draft);
      else d.drafts[idx] = draft;
      return draft;
    });
  }

  /** Manual edits from the editor. Content is re-validated and can't change format. */
  async update(id: string, patch: { content?: DraftContent; status?: DraftStatus; inspirationIds?: string[] }, now = new Date()): Promise<StoredDraft> {
    if (patch.status && !DRAFT_STATUSES.includes(patch.status)) throw new Error(`Invalid status: ${patch.status}`);
    const parsed = patch.content ? DraftContentSchema.parse(patch.content) : undefined;
    return (await this.s()).mutateJSON<File, StoredDraft>(DRAFTS, { drafts: [] }, (d) => {
      const idx = d.drafts.findIndex((x) => x.id === id);
      if (idx === -1) throw new Error(`Draft not found: ${id}`);
      const draft = d.drafts[idx];
      if (parsed && parsed.format !== draft.content.format) throw new Error("A draft's format can't be changed");
      const inspirationIds = patch.inspirationIds ? [...new Set(patch.inspirationIds)].slice(0, 10) : draft.inspirationIds;
      d.drafts[idx] = { ...draft, content: parsed ?? draft.content, status: patch.status ?? draft.status, inspirationIds, updatedAt: now.toISOString() };
      return d.drafts[idx];
    });
  }

  async delete(id: string): Promise<void> {
    await (await this.s()).mutateJSON<File, void>(DRAFTS, { drafts: [] }, (d) => {
      d.drafts = d.drafts.filter((x) => x.id !== id);
    });
  }
}

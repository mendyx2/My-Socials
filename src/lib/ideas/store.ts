import path from "node:path";
import { readJson, writeJson } from "../json-file";
import { DATA_DIR } from "../paths";
import { STATUSES, type IdeaStatus, type StoredIdea } from "./schema";

const MAX_SEEN = 3000;

export class IdeaStore {
  constructor(private readonly dir = DATA_DIR) {}

  private get ideasFile() {
    return path.join(this.dir, "ideas.json");
  }
  private get seenFile() {
    return path.join(this.dir, "seen-news.json");
  }

  async list(): Promise<StoredIdea[]> {
    const data = await readJson<{ ideas: StoredIdea[] }>(this.ideasFile, { ideas: [] });
    return data.ideas;
  }

  async add(ideas: StoredIdea[]): Promise<void> {
    const all = await this.list();
    await writeJson(this.ideasFile, { ideas: [...ideas, ...all] });
  }

  async update(id: string, patch: { status?: IdeaStatus; notes?: string }): Promise<StoredIdea> {
    if (patch.status && !STATUSES.includes(patch.status)) throw new Error(`Invalid status: ${patch.status}`);
    const all = await this.list();
    const idx = all.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error(`Idea not found: ${id}`);
    const updated: StoredIdea = {
      ...all[idx],
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    };
    all[idx] = updated;
    await writeJson(this.ideasFile, { ideas: all });
    return updated;
  }

  async seenNewsIds(): Promise<Set<string>> {
    const data = await readJson<{ ids: string[] }>(this.seenFile, { ids: [] });
    return new Set(data.ids);
  }

  async markNewsSeen(ids: string[]): Promise<void> {
    const data = await readJson<{ ids: string[] }>(this.seenFile, { ids: [] });
    const merged = [...new Set([...ids, ...data.ids])].slice(0, MAX_SEEN);
    await writeJson(this.seenFile, { ids: merged });
  }
}

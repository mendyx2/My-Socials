import { getStorage, type Storage } from "../storage";
import { STATUSES, type IdeaStatus, type StoredIdea } from "./schema";

const MAX_SEEN = 3000;
const IDEAS = "data/ideas.json";
const SEEN = "data/seen-news.json";

export class IdeaStore {
  constructor(private readonly storage?: Storage) {}
  private s() {
    return this.storage ? Promise.resolve(this.storage) : getStorage();
  }

  async list(): Promise<StoredIdea[]> {
    return (await (await this.s()).getJSON<{ ideas: StoredIdea[] }>(IDEAS, { ideas: [] })).ideas;
  }

  async add(ideas: StoredIdea[]): Promise<void> {
    await (await this.s()).mutateJSON<{ ideas: StoredIdea[] }, void>(IDEAS, { ideas: [] }, (d) => {
      d.ideas = [...ideas, ...d.ideas];
    });
  }

  async update(id: string, patch: { status?: IdeaStatus; notes?: string }): Promise<StoredIdea> {
    if (patch.status && !STATUSES.includes(patch.status)) throw new Error(`Invalid status: ${patch.status}`);
    return (await this.s()).mutateJSON<{ ideas: StoredIdea[] }, StoredIdea>(IDEAS, { ideas: [] }, (d) => {
      const idx = d.ideas.findIndex((i) => i.id === id);
      if (idx === -1) throw new Error(`Idea not found: ${id}`);
      d.ideas[idx] = {
        ...d.ideas[idx],
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      };
      return d.ideas[idx];
    });
  }

  async seenNewsIds(): Promise<Set<string>> {
    return new Set((await (await this.s()).getJSON<{ ids: string[] }>(SEEN, { ids: [] })).ids);
  }

  async markNewsSeen(ids: string[]): Promise<void> {
    await (await this.s()).mutateJSON<{ ids: string[] }, void>(SEEN, { ids: [] }, (d) => {
      d.ids = [...new Set([...ids, ...d.ids])].slice(0, MAX_SEEN);
    });
  }
}

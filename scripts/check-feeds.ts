import { loadFeedsConfig } from "../src/lib/news/config";
import { fetchAllFeeds } from "../src/lib/news/fetch";

const cfg = await loadFeedsConfig();
const { results } = await fetchAllFeeds(cfg.feeds, { maxItems: cfg.maxItemsPerFeed });
for (const r of results) {
  console.log(`${r.ok ? "✅" : "❌"} ${r.feed.name.padEnd(36)} ${r.ok ? `${r.count} items` : r.error}`);
}
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad}/${results.length} feeds working. Edit config/feeds.json to fix or replace broken ones.`);

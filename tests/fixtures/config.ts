import { FeedsConfigSchema } from "@/src/lib/news/config";

export const cfg = FeedsConfigSchema.parse({
  maxAgeHours: 72,
  maxItemsPerFeed: 20,
  pillars: {
    web: { label: "Web", keywords: ["css", "website", "seo", "core web vitals"] },
    flutter: { label: "Flutter", keywords: ["flutter", "mobile"] },
    "ai-automation": { label: "AI", keywords: ["ai", "automation"] },
  },
  feeds: [
    { name: "RSS", url: "https://feeds.test/rss", pillar: "ai-automation" },
    { name: "Atom", url: "https://feeds.test/atom", pillar: "web" },
  ],
});

import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CONFIG_DIR } from "../paths";

export const FeedSchema = z.object({
  name: z.string().min(1),
  url: z.url(),
  pillar: z.string().min(1),
});

export const FeedsConfigSchema = z
  .object({
    maxAgeHours: z.number().positive().default(72),
    maxItemsPerFeed: z.number().int().positive().default(20),
    pillars: z.record(z.string(), z.object({ label: z.string(), keywords: z.array(z.string()) })),
    feeds: z.array(FeedSchema),
  })
  .superRefine((cfg, ctx) => {
    cfg.feeds.forEach((f, i) => {
      if (!(f.pillar in cfg.pillars)) {
        ctx.addIssue({ code: "custom", path: ["feeds", i, "pillar"], message: `Unknown pillar "${f.pillar}"` });
      }
    });
  });

export type Feed = z.infer<typeof FeedSchema>;
export type FeedsConfig = z.infer<typeof FeedsConfigSchema>;

export async function loadFeedsConfig(file = path.join(CONFIG_DIR, "feeds.json")): Promise<FeedsConfig> {
  const raw = JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ file, "utf8"));
  return FeedsConfigSchema.parse(raw);
}

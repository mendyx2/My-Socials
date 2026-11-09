import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CONFIG_DIR } from "../paths";

const color = z.string().min(3).max(40).regex(/^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,]+\))$/, "Use a hex or rgb(a) color");

export const ThemeSchema = z.object({
  brandName: z.string().max(40),
  personName: z.string().max(60),
  roles: z.string().max(120),
  tagline: z.string().max(80).default(""),
  website: z.string().max(120).default(""),
  /** e.g. "@oi.dev". Shown in slide footers when set. */
  handle: z.string().max(40).default(""),
  colors: z.object({
    background: color,
    backgroundDeep: color,
    surface: color,
    border: color,
    accent: color,
    accentStrong: color,
    /** Darker accent for light slides, where the normal accent is too pale to read. */
    accentDark: color.default("#3B5BA9"),
    text: color,
    muted: color,
  }),
});

export type Theme = z.infer<typeof ThemeSchema>;

export async function loadTheme(file = path.join(CONFIG_DIR, "theme.json")): Promise<Theme> {
  return ThemeSchema.parse(JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ file, "utf8")));
}

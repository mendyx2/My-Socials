import { promises as fs } from "node:fs";
import path from "node:path";
import type { Browser } from "playwright";
import type { CarouselDraft } from "../drafts/schema";
import type { ProfileContent } from "../profiles/schema";
import { ROOT } from "../paths";
import { bannerHtml, highlightHtml, SIZES, slideHtml } from "./templates";
import type { Theme } from "./theme";

export const RENDERS_DIR = path.join(ROOT, "renders");

export interface RenderedFile {
  name: string;
  /** Path relative to RENDERS_DIR, used in /api/renders/... URLs. */
  rel: string;
  kind: "png" | "pdf";
  width: number;
  height: number;
  /** Set when text had to shrink a lot or still doesn't fit. */
  warning?: string;
}

/* ---------- fonts (bundled, so rendering works offline) ---------- */

const FONTS: { family: string; weight: number; pkg: string; file: string }[] = [
  { family: "Playfair Display", weight: 500, pkg: "playfair-display", file: "playfair-display-latin-500-normal.woff2" },
  { family: "Playfair Display", weight: 600, pkg: "playfair-display", file: "playfair-display-latin-600-normal.woff2" },
  { family: "Playfair Display", weight: 700, pkg: "playfair-display", file: "playfair-display-latin-700-normal.woff2" },
  { family: "Inter", weight: 400, pkg: "inter", file: "inter-latin-400-normal.woff2" },
  { family: "Inter", weight: 600, pkg: "inter", file: "inter-latin-600-normal.woff2" },
  { family: "Inter", weight: 700, pkg: "inter", file: "inter-latin-700-normal.woff2" },
  { family: "Caveat", weight: 500, pkg: "caveat", file: "caveat-latin-500-normal.woff2" },
];

let fontCssCache: string | null = null;
export async function fontCss(): Promise<string> {
  if (fontCssCache) return fontCssCache;
  const faces = await Promise.all(
    FONTS.map(async (f) => {
      const file = path.join(ROOT, "node_modules", "@fontsource", f.pkg, "files", f.file);
      const data = (await fs.readFile(/*turbopackIgnore: true*/ file)).toString("base64");
      return `@font-face{font-family:"${f.family}";font-weight:${f.weight};font-style:normal;font-display:block;src:url(data:font/woff2;base64,${data}) format("woff2")}`;
    }),
  );
  fontCssCache = faces.join("\n");
  return fontCssCache;
}

/* ---------- browser ---------- */

export async function withBrowser<T>(fn: (b: Browser) => Promise<T>): Promise<T> {
  const { chromium } = await import("playwright");
  let browser: Browser;
  try {
    browser = await chromium.launch();
  } catch (first) {
    try {
      // Fall back to an installed Google Chrome.
      browser = await chromium.launch({ channel: "chrome" });
    } catch {
      throw new Error(
        `Couldn't start a browser to render images. Run "npx playwright install chromium" once, then try again.\n(${(first as Error).message.split("\n")[0]})`,
      );
    }
  }
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

/** Renders one HTML document to a PNG. No network: templates are self-contained. */
async function renderPng(browser: Browser, html: string, size: { width: number; height: number }, out: string) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  try {
    await page.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 15000 });
    const fit = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-fit]")].map((el) => ({
        scale: Number(el.dataset.scale ?? 1),
        overflow: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
      })),
    );
    await page.screenshot({ path: out, type: "png" });
    const worst = fit.reduce((a, b) => (b.overflow || b.scale < a.scale ? b : a), { scale: 1, overflow: false });
    if (worst.overflow) return "Text still doesn't fit. Shorten it.";
    if (worst.scale < 0.75) return `Text was shrunk to ${Math.round(worst.scale * 100)}% to fit. Consider shortening it.`;
    return undefined;
  } finally {
    await page.close();
  }
}

/** Builds a PDF from finished PNGs so the PDF matches the images exactly. */
async function pngsToPdf(browser: Browser, pngs: string[], size: { width: number; height: number }, out: string) {
  const imgs = await Promise.all(pngs.map(async (p) => `data:image/png;base64,${(await fs.readFile(p)).toString("base64")}`));
  const html = `<!doctype html><html><head><style>@page{size:${size.width}px ${size.height}px;margin:0}*{margin:0;padding:0}
img{display:block;width:${size.width}px;height:${size.height}px;break-after:page}img:last-child{break-after:auto}</style></head>
<body>${imgs.map((src) => `<img src="${src}">`).join("")}</body></html>`;
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({ path: out, width: `${size.width}px`, height: `${size.height}px`, printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
  } finally {
    await page.close();
  }
}

async function freshDir(rel: string): Promise<string> {
  const dir = path.join(RENDERS_DIR, rel);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";

export async function renderCarousel(
  draftId: string,
  c: CarouselDraft,
  theme: Theme,
  images: Record<string, string> = {},
): Promise<RenderedFile[]> {
  const rel = path.posix.join("drafts", draftId);
  const dir = await freshDir(rel);
  const css = await fontCss();
  return withBrowser(async (browser) => {
    const files: RenderedFile[] = [];
    const pngs: string[] = [];
    for (const [i, s] of c.slides.entries()) {
      const name = `slide-${String(i + 1).padStart(2, "0")}.png`;
      const out = path.join(dir, name);
      const html = slideHtml(s, i, c.slides.length, theme, css, { imageSrc: (id) => images[id] });
      const missing = s.image && !images[s.image] ? "its image is missing from the library" : undefined;
      const warning = (await renderPng(browser, html, SIZES.slide, out)) ?? missing;
      pngs.push(out);
      files.push({ name, rel: `${rel}/${name}`, kind: "png", ...SIZES.slide, ...(warning ? { warning: `Slide ${i + 1}: ${warning}` } : {}) });
    }
    await pngsToPdf(browser, pngs, SIZES.slide, path.join(dir, "carousel.pdf"));
    files.push({ name: "carousel.pdf", rel: `${rel}/carousel.pdf`, kind: "pdf", ...SIZES.slide });
    return files;
  });
}

export async function renderProfileVisuals(versionId: string, p: ProfileContent, theme: Theme): Promise<RenderedFile[]> {
  const rel = path.posix.join("profile", versionId);
  const dir = await freshDir(rel);
  const css = await fontCss();
  return withBrowser(async (browser) => {
    const files: RenderedFile[] = [];
    const banner = p.linkedin.banner;
    const w = await renderPng(browser, bannerHtml(banner, theme, css), SIZES.banner, path.join(dir, "linkedin-banner.png"));
    files.push({ name: "linkedin-banner.png", rel: `${rel}/linkedin-banner.png`, kind: "png", ...SIZES.banner, ...(w ? { warning: `Banner: ${w}` } : {}) });
    await renderPng(browser, bannerHtml(banner, theme, css, { showPhotoZone: true }), SIZES.banner, path.join(dir, "linkedin-banner-preview.png"));
    files.push({ name: "linkedin-banner-preview.png", rel: `${rel}/linkedin-banner-preview.png`, kind: "png", ...SIZES.banner });
    for (const [i, h] of p.instagram.highlights.entries()) {
      const name = `highlight-${i + 1}-${slug(h.name)}.png`;
      await renderPng(browser, highlightHtml(h.name, theme, css), SIZES.highlight, path.join(dir, name));
      files.push({ name, rel: `${rel}/${name}`, kind: "png", ...SIZES.highlight });
    }
    return files;
  });
}

/** Lists files already rendered for a draft or profile version, so the page can show them again. */
export async function listRendered(rel: string): Promise<RenderedFile[]> {
  const dir = path.join(RENDERS_DIR, rel);
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  return names
    .filter((n) => /\.(png|pdf)$/.test(n))
    .sort()
    .map((name) => {
      const size = name.startsWith("linkedin-banner") ? SIZES.banner : name.startsWith("highlight") ? SIZES.highlight : SIZES.slide;
      return { name, rel: `${rel}/${name}`, kind: name.endsWith(".pdf") ? ("pdf" as const) : ("png" as const), ...size };
    });
}

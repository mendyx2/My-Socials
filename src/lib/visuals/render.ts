import type { Browser } from "playwright-core";
import type { CarouselDraft } from "../drafts/schema";
import type { ProfileContent } from "../profiles/schema";
import { getStorage, wantsNetlify, type Storage } from "../storage";
import { bannerHtml, highlightHtml, SIZES, slideHtml } from "./templates";
import type { Theme } from "./theme";

/** Rendered files live in storage under this prefix: renders/drafts/<id>/slide-01.png etc. */
export const RENDERS_PREFIX = "renders";

export interface RenderedFile {
  name: string;
  /** Path under renders/, used in /api/renders/... URLs. */
  rel: string;
  kind: "png" | "pdf";
  width: number;
  height: number;
  /** Set when text had to shrink a lot or still doesn't fit. */
  warning?: string;
}

/* ---------- fonts (baked into the code, so rendering works offline and when hosted) ---------- */

export async function fontCss(): Promise<string> {
  return (await import("./fonts.generated")).FONT_CSS;
}

/* ---------- browser ---------- */

/** Chromium build for serverless functions, downloaded on first use and cached in /tmp. */
const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ?? "https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar";

async function launch(): Promise<Browser> {
  // RENDER_BROWSER: "serverless" | "local" overrides the automatic choice.
  const serverless = process.env.RENDER_BROWSER ? process.env.RENDER_BROWSER === "serverless" : wantsNetlify();
  if (serverless) {
    const [{ chromium }, sparticuz] = await Promise.all([import("playwright-core"), import("@sparticuz/chromium-min")]);
    const Chromium = sparticuz.default;
    return chromium.launch({ executablePath: await Chromium.executablePath(CHROMIUM_PACK_URL), args: Chromium.args, headless: true });
  }
  const { chromium } = await import("playwright");
  try {
    return await chromium.launch();
  } catch (first) {
    try {
      return await chromium.launch({ channel: "chrome" }); // an installed Google Chrome
    } catch {
      throw new Error(
        `Couldn't start a browser to render images. Run "npx playwright install chromium" once, then try again.\n(${(first as Error).message.split("\n")[0]})`,
      );
    }
  }
}

export async function withBrowser<T>(fn: (b: Browser) => Promise<T>): Promise<T> {
  const browser = await launch();
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

/**
 * Renders one HTML document. Returns a PNG, a JPEG copy (used to keep the PDF small) and a
 * warning if text had to shrink a lot. No network: templates are self-contained.
 */
async function renderImage(browser: Browser, html: string, size: { width: number; height: number }) {
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
    const png = new Uint8Array(await page.screenshot({ type: "png" }));
    const jpeg = new Uint8Array(await page.screenshot({ type: "jpeg", quality: 88 }));
    const worst = fit.reduce((a, b) => (b.overflow || b.scale < a.scale ? b : a), { scale: 1, overflow: false });
    const warning = worst.overflow
      ? "Text still doesn't fit. Shorten it."
      : worst.scale < 0.75
        ? `Text was shrunk to ${Math.round(worst.scale * 100)}% to fit. Consider shortening it.`
        : undefined;
    return { png, jpeg, warning };
  } finally {
    await page.close();
  }
}

/** One page per slide. Built from JPEGs so it stays small enough to download when hosted. */
async function imagesToPdf(browser: Browser, jpegs: Uint8Array[], size: { width: number; height: number }): Promise<Uint8Array> {
  const html = `<!doctype html><html><head><style>@page{size:${size.width}px ${size.height}px;margin:0}*{margin:0;padding:0}
img{display:block;width:${size.width}px;height:${size.height}px;break-after:page}img:last-child{break-after:auto}</style></head>
<body>${jpegs.map((j) => `<img src="data:image/jpeg;base64,${Buffer.from(j).toString("base64")}">`).join("")}</body></html>`;
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    return new Uint8Array(
      await page.pdf({ width: `${size.width}px`, height: `${size.height}px`, printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } }),
    );
  } finally {
    await page.close();
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";

async function freshPrefix(storage: Storage, rel: string): Promise<void> {
  await storage.deletePrefix(`${RENDERS_PREFIX}/${rel}/`);
}

export async function renderCarousel(
  draftId: string,
  c: CarouselDraft,
  theme: Theme,
  images: Record<string, string> = {},
  storage?: Storage,
): Promise<RenderedFile[]> {
  const s = storage ?? (await getStorage());
  const rel = `drafts/${draftId}`;
  const css = await fontCss();
  const rendered = await withBrowser(async (browser) => {
    const out: { name: string; png: Uint8Array; jpeg: Uint8Array; warning?: string }[] = [];
    for (const [i, slide] of c.slides.entries()) {
      const html = slideHtml(slide, i, c.slides.length, theme, css, { imageSrc: (id) => images[id] });
      const missing = slide.image && !images[slide.image] ? "its image is missing from the library" : undefined;
      const r = await renderImage(browser, html, SIZES.slide);
      out.push({ name: `slide-${String(i + 1).padStart(2, "0")}.png`, png: r.png, jpeg: r.jpeg, warning: r.warning ?? missing });
    }
    const pdf = await imagesToPdf(browser, out.map((o) => o.jpeg), SIZES.slide);
    return { out, pdf };
  });
  await freshPrefix(s, rel);
  const files: RenderedFile[] = [];
  for (const [i, o] of rendered.out.entries()) {
    await s.setBytes(`${RENDERS_PREFIX}/${rel}/${o.name}`, o.png);
    files.push({ name: o.name, rel: `${rel}/${o.name}`, kind: "png", ...SIZES.slide, ...(o.warning ? { warning: `Slide ${i + 1}: ${o.warning}` } : {}) });
  }
  await s.setBytes(`${RENDERS_PREFIX}/${rel}/carousel.pdf`, rendered.pdf);
  files.push({ name: "carousel.pdf", rel: `${rel}/carousel.pdf`, kind: "pdf", ...SIZES.slide });
  return files;
}

export async function renderProfileVisuals(versionId: string, p: ProfileContent, theme: Theme, storage?: Storage): Promise<RenderedFile[]> {
  const s = storage ?? (await getStorage());
  const rel = `profile/${versionId}`;
  const css = await fontCss();
  const banner = p.linkedin.banner;
  const outputs = await withBrowser(async (browser) => {
    const list: { name: string; png: Uint8Array; size: { width: number; height: number }; warning?: string }[] = [];
    const main = await renderImage(browser, bannerHtml(banner, theme, css), SIZES.banner);
    list.push({ name: "linkedin-banner.png", png: main.png, size: SIZES.banner, warning: main.warning && `Banner: ${main.warning}` });
    const preview = await renderImage(browser, bannerHtml(banner, theme, css, { showPhotoZone: true }), SIZES.banner);
    list.push({ name: "linkedin-banner-preview.png", png: preview.png, size: SIZES.banner });
    for (const [i, h] of p.instagram.highlights.entries()) {
      const r = await renderImage(browser, highlightHtml(h.name, theme, css), SIZES.highlight);
      list.push({ name: `highlight-${i + 1}-${slug(h.name)}.png`, png: r.png, size: SIZES.highlight });
    }
    return list;
  });
  await freshPrefix(s, rel);
  const files: RenderedFile[] = [];
  for (const o of outputs) {
    await s.setBytes(`${RENDERS_PREFIX}/${rel}/${o.name}`, o.png);
    files.push({ name: o.name, rel: `${rel}/${o.name}`, kind: "png", ...o.size, ...(o.warning ? { warning: o.warning } : {}) });
  }
  return files;
}

/** Lists files already rendered for a draft or profile version, so the page can show them again. */
export async function listRendered(rel: string, storage?: Storage): Promise<RenderedFile[]> {
  const s = storage ?? (await getStorage());
  const prefix = `${RENDERS_PREFIX}/${rel}/`;
  return (await s.list(prefix))
    .map((k) => k.slice(prefix.length))
    .filter((n) => /^[\w.-]+\.(png|pdf)$/.test(n))
    .map((name) => {
      const size = name.startsWith("linkedin-banner") ? SIZES.banner : name.startsWith("highlight") ? SIZES.highlight : SIZES.slide;
      return { name, rel: `${rel}/${name}`, kind: name.endsWith(".pdf") ? ("pdf" as const) : ("png" as const), ...size };
    });
}

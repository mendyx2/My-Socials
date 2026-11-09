import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DraftContentSchema, type CarouselDraft } from "@/src/lib/drafts/schema";
import { bannerHtml, esc, highlightHtml, slideHtml } from "@/src/lib/visuals/templates";
import { loadTheme, ThemeSchema } from "@/src/lib/visuals/theme";

const theme = await loadTheme();
const slide = (x: Record<string, unknown>) =>
  (DraftContentSchema.parse({ format: "carousel", slides: [x, x, x], instagram: { caption: "c" }, linkedin: { post: "p" } }) as CarouselDraft).slides[0];

describe("templates", () => {
  it("escapes all text so AI output can't inject HTML", () => {
    expect(esc(`<img src=x onerror="alert(1)">&'`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;");
    const html = slideHtml(slide({ layout: "point", title: "<script>bad()</script>", items: ["<b>x</b>"] }), 0, 3, theme, "");
    expect(html).not.toContain("<script>bad()");
    expect(html).toContain("&lt;script&gt;bad()");
    expect(html).not.toContain("<b>x</b>");
  });

  it("lays out comparison rows as aligned pairs with headings from the body", () => {
    const html = slideHtml(slide({ layout: "comparison", title: "T", body: "Manual vs Automated", items: ["Copy leads | Leads arrive", "Chase invoices | Auto reminders"] }), 1, 3, theme, "");
    expect(html).toContain("<h3>Manual</h3>");
    expect(html).toContain('<h3 class="right">Automated</h3>');
    expect(html.indexOf("Copy leads")).toBeLessThan(html.indexOf("Leads arrive"));
    expect(html.indexOf("Leads arrive")).toBeLessThan(html.indexOf("Chase invoices"));
  });

  it("shows the source on stat slides and the tagline only on the last slide", () => {
    const s = slide({ layout: "stat", title: "Hours lost", stat: "5 hrs", source: "Some report" });
    expect(slideHtml(s, 0, 3, theme, "")).toContain("Source: Some report");
    expect(slideHtml(s, 0, 3, theme, "")).toContain("Swipe →");
    expect(slideHtml(s, 2, 3, theme, "")).toContain(theme.tagline);
  });

  it("banner and highlight include brand details and escape text", () => {
    const b = bannerHtml({ headline: "Web <apps>", subline: "", cta: "Book" }, theme, "", { showPhotoZone: true });
    expect(b).toContain(theme.personName);
    expect(b).toContain("Web &lt;apps&gt;");
    expect(b).toContain("photo (approx.)");
    expect(highlightHtml("results", theme, "")).toContain(">R<");
    expect(highlightHtml("✨ Services", theme, "")).toContain(">S<");
  });

  it("applies the slide's colour variant", () => {
    expect(slideHtml(slide({ layout: "point", title: "T", variant: "accent" }), 0, 3, theme, "")).toContain('class="canvas slide v-accent layout-point');
    expect(slide({ layout: "point", title: "T", variant: "neon" }).variant).toBe("dark");
  });

  it("uses images only from data URLs or the media route, as background on cover/image and inline elsewhere", () => {
    const data = "data:image/png;base64,AAAA";
    const cover = slideHtml(slide({ layout: "cover", title: "T", image: "a" }), 0, 3, theme, "", { imageSrc: () => data });
    expect(cover).toContain('class="bg-img"');
    expect(cover).toContain("has-bg");
    const point = slideHtml(slide({ layout: "point", title: "T", image: "a" }), 0, 3, theme, "", { imageSrc: () => "/api/media/abc-123/file" });
    expect(point).toContain('<div class="media"><img src="/api/media/abc-123/file"');
    const evil = slideHtml(slide({ layout: "cover", title: "T", image: "a" }), 0, 3, theme, "", { imageSrc: () => "https://evil.example/x.png" });
    expect(evil).not.toContain("evil.example");
    expect(evil).not.toContain('class="bg-img"');
  });

  it("validates theme colors", () => {
    expect(() => ThemeSchema.parse({ ...theme, colors: { ...theme.colors, accent: "url(javascript:x)" } })).toThrow();
  });
});

// Rendering needs a browser. Skipped (not failed) where none is installed.
let browserOk = false;
try {
  const { chromium } = await import("playwright");
  await (await chromium.launch()).close();
  browserOk = true;
} catch {
  /* no browser */
}

describe.skipIf(!browserOk)("rendering (real browser)", () => {
  it("renders slides as 1080x1350 PNGs plus a small PDF with one page per slide", async () => {
    const { FileStorage } = await import("@/src/lib/storage");
    const { renderCarousel, listRendered } = await import("@/src/lib/visuals/render");
    const dir = mkdtempSync(path.join(tmpdir(), "r-"));
    const storage = new FileStorage(dir);
    const c = DraftContentSchema.parse({
      format: "carousel",
      slides: [
        { layout: "cover", title: "Hello" },
        { layout: "point", title: "word ".repeat(27).trim(), body: "longer ".repeat(55).trim(), items: ["an item that is fairly long", "another fairly long item", "and a third one here"] },
        { layout: "cta", title: "Book a call" },
      ],
      instagram: { caption: "c" },
      linkedin: { post: "p" },
    }) as CarouselDraft;
    const files = await renderCarousel("d1", c, theme, {}, storage);
    expect(files.map((f) => f.name)).toEqual(["slide-01.png", "slide-02.png", "slide-03.png", "carousel.pdf"]);
    const png = readFileSync(path.join(dir, "renders", files[0].rel));
    expect(png.readUInt32BE(16)).toBe(1080); // PNG width
    expect(png.readUInt32BE(20)).toBe(1350); // PNG height
    expect(files[1].warning).toMatch(/Slide 2: Text (was shrunk|still doesn't fit)/);
    const pdfBytes = readFileSync(path.join(dir, "renders", files[3].rel));
    const pdf = pdfBytes.toString("latin1");
    expect(pdf.startsWith("%PDF")).toBe(true);
    expect(pdf.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(3);
    expect(pdf).toContain("/DCTDecode"); // JPEG pages keep the PDF small
    expect((await listRendered("drafts/d1", storage)).map((f) => f.name)).toEqual(["carousel.pdf", "slide-01.png", "slide-02.png", "slide-03.png"]);
    // Re-rendering with fewer slides removes the old ones.
    await renderCarousel("d1", { ...c, slides: [c.slides[0], c.slides[2], c.slides[0]] }, theme, {}, storage);
    expect(existsSync(path.join(dir, "renders/drafts/d1/slide-03.png"))).toBe(true);
    await renderCarousel("d1", { ...c, slides: c.slides.slice(0, 3) }, theme, {}, storage);
    expect((await listRendered("drafts/d1", storage)).length).toBe(4);
  }, 90000);
});

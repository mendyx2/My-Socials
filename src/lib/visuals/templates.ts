// Pure HTML builders for rendered images. All user/AI text is escaped.
import type { Slide } from "../drafts/schema";
import type { Theme } from "./theme";

export const SIZES = {
  slide: { width: 1080, height: 1350 },
  banner: { width: 1584, height: 396 },
  highlight: { width: 1080, height: 1920 },
} as const;

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Line breaks in text become <br>. */
const lines = (s: string) => esc(s).replace(/\n/g, "<br>");

/** Colour tokens. Slides can switch variant; everything else uses "dark". */
function vars(t: Theme): string {
  const c = t.colors;
  return `:root,.v-dark{--bg:${c.background};--bg-deep:${c.backgroundDeep};--surface:${c.surface};--border:${c.border};--accent:${c.accent};--accent-strong:${c.accentStrong};--text:${c.text};--muted:${c.muted};--on-accent:${c.backgroundDeep};--overlay:${c.backgroundDeep}}
.v-light{--bg:#F5F7FC;--bg-deep:#E4E9F4;--surface:rgba(28,31,40,.05);--border:rgba(28,31,40,.14);--accent:${c.accentDark};--accent-strong:${c.accentDark};--text:${c.backgroundDeep};--muted:#4A5266;--on-accent:#FFFFFF;--overlay:#F5F7FC}
.v-accent{--bg:${c.accent};--bg-deep:${c.accentStrong};--surface:rgba(255,255,255,.32);--border:rgba(28,31,40,.18);--accent:${c.backgroundDeep};--accent-strong:${c.background};--text:${c.backgroundDeep};--muted:rgba(28,31,40,.74);--on-accent:${c.accent};--overlay:${c.accent}}`;
}

function baseCss(t: Theme, fontCss: string, size: { width: number; height: number }): string {
  return `${fontCss}
${vars(t)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${size.width}px;height:${size.height}px;overflow:hidden}
body{background:var(--bg-deep);font-family:"Inter",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.serif{font-family:"Playfair Display",Georgia,serif}
.script{font-family:"Caveat",cursive}
.canvas{position:relative;width:100%;height:100%;overflow:hidden;color:var(--text);
  background:
    radial-gradient(900px 700px at 85% 0%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%),
    radial-gradient(700px 600px at 0% 100%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%),
    linear-gradient(160deg, var(--bg), var(--bg-deep));}
.ring{position:absolute;border-radius:50%;border:2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  box-shadow:0 0 40px color-mix(in srgb, var(--accent) 35%, transparent), inset 0 0 40px color-mix(in srgb, var(--accent) 20%, transparent)}
.logo{display:flex;align-items:center;gap:14px;color:var(--text);font-size:26px;letter-spacing:.02em}
.logo i{display:block;width:36px;height:36px;border:3px solid var(--accent);border-radius:50%;box-shadow:0 0 14px color-mix(in srgb, var(--accent) 60%, transparent)}
.accent{color:var(--accent)}
.muted{color:var(--muted)}
.grad{background:linear-gradient(90deg, var(--accent), var(--accent-strong));-webkit-background-clip:text;background-clip:text;color:transparent}
.glass{background:var(--surface);border:1px solid var(--border);border-radius:28px}
.pill{display:inline-flex;align-items:center;gap:12px;border:2px solid var(--accent);color:var(--text);border-radius:999px;padding:14px 30px;font-weight:600}
.pill.solid{background:var(--accent);color:var(--on-accent)}`;
}

/**
 * Shrinks a box's --s scale until its content fits, so long AI text never overflows.
 * Sets window.__ready when fonts are loaded and fitting is done.
 */
const FIT_SCRIPT = `<script>
document.fonts.ready.then(() => {
  for (const el of document.querySelectorAll("[data-fit]")) {
    let s = 1;
    el.style.setProperty("--s", s);
    while ((el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) && s > 0.5) {
      s = Math.round((s - 0.04) * 100) / 100;
      el.style.setProperty("--s", s);
    }
    el.dataset.scale = s;
  }
  window.__ready = true;
});
</script>`;

function doc(css: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}${FIT_SCRIPT}</body></html>`;
}

/* ---------------- carousel slides ---------------- */

const slideCss = () => `
.slide{display:flex;flex-direction:column;padding:84px 88px 72px}
.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:56px}
.count{font-size:24px;color:var(--muted);letter-spacing:.1em}
.content{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--s,1)*36px);overflow:hidden}
.foot{display:flex;justify-content:space-between;align-items:center;margin-top:44px;font-size:24px;color:var(--muted)}
.foot .script{font-size:38px;color:var(--accent)}
.kicker{font-size:calc(var(--s,1)*26px);letter-spacing:.24em;text-transform:uppercase;color:var(--accent);font-weight:600}
.title{font-family:"Playfair Display",Georgia,serif;font-weight:600;line-height:1.08;font-size:calc(var(--s,1)*84px)}
.layout-cover .title{font-size:calc(var(--s,1)*112px)}
.body{font-size:calc(var(--s,1)*38px);line-height:1.4;color:var(--muted)}
.rule{width:140px;height:4px;border-radius:2px;background:var(--accent)}
.list{display:flex;flex-direction:column;gap:calc(var(--s,1)*22px)}
.row{display:flex;gap:28px;align-items:center;padding:calc(var(--s,1)*26px) 32px;font-size:calc(var(--s,1)*36px);line-height:1.3}
.num{flex:none;width:calc(var(--s,1)*64px);height:calc(var(--s,1)*64px);border-radius:50%;border:3px solid var(--accent);color:var(--accent);
  display:grid;place-items:center;font-weight:700;font-size:calc(var(--s,1)*30px)}
.check{flex:none;width:calc(var(--s,1)*52px);height:calc(var(--s,1)*52px);border-radius:50%;background:var(--accent);position:relative}
.check::after{content:"";position:absolute;left:34%;top:20%;width:24%;height:44%;border:solid var(--on-accent);border-width:0 6px 6px 0;transform:rotate(45deg)}
.stat{font-family:"Playfair Display",serif;font-weight:700;line-height:1;font-size:calc(var(--s,1)*230px)}
.source{font-size:22px;color:var(--muted);border-top:1px solid var(--border);padding-top:18px}
.cmp{display:grid;grid-template-columns:1fr 1fr;gap:calc(var(--s,1)*16px) 24px}
.cmp h3{font-family:"Playfair Display",serif;font-size:calc(var(--s,1)*46px);font-weight:600;padding:0 6px}
.cmp h3.right{color:var(--accent)}
.cell{padding:calc(var(--s,1)*24px) 28px;font-size:calc(var(--s,1)*32px);line-height:1.3;border-radius:22px}
.cell.right{border-color:color-mix(in srgb, var(--accent) 60%, transparent)}
.quote-mark{font-family:"Playfair Display",serif;font-size:calc(var(--s,1)*220px);line-height:.6;color:var(--accent);height:calc(var(--s,1)*110px)}
.layout-quote .title{font-style:italic;font-weight:500}
.layout-cta .title{font-size:calc(var(--s,1)*96px)}
.who{display:flex;flex-direction:column;gap:8px;font-size:calc(var(--s,1)*28px)}
.who b{font-family:"Playfair Display",serif;font-size:calc(var(--s,1)*40px);font-weight:600}
.pill{font-size:calc(var(--s,1)*34px)}
.media{width:100%;height:calc(var(--s,1)*430px);flex:none;border-radius:28px;overflow:hidden;border:1px solid var(--border)}
.media img{width:100%;height:100%;object-fit:cover;display:block}
.bg-img{position:absolute;inset:0;z-index:0}
.bg-img img{width:100%;height:100%;object-fit:cover;display:block}
.bg-img::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg, color-mix(in srgb, var(--overlay) 55%, transparent) 0%, color-mix(in srgb, var(--overlay) 20%, transparent) 30%, color-mix(in srgb, var(--overlay) 88%, transparent) 62%, color-mix(in srgb, var(--overlay) 96%, transparent) 100%)}
.slide>.head,.slide>.content,.slide>.foot{position:relative;z-index:1}
.has-bg .content{justify-content:flex-end}
.layout-image .title{font-size:calc(var(--s,1)*92px)}
`;

function splitComparison(s: Slide): { left: string; right: string; rows: [string, string][] } {
  const [left, right] = (s.body.split(/\s+vs\.?\s+/i).length === 2 ? s.body.split(/\s+vs\.?\s+/i) : ["Before", "After"]).map((x) => x.trim());
  const rows = s.items.map((it) => {
    const [a, b] = it.split("|").map((x) => x.trim());
    return [a ?? "", b ?? ""] as [string, string];
  });
  return { left, right, rows };
}

function slideContent(s: Slide, i: number, t: Theme, inlineImg: string): string {
  const title = `<h1 class="title">${lines(s.title)}</h1>`;
  const body = s.body ? `<p class="body">${lines(s.body)}</p>` : "";
  const kicker = `<div class="kicker">${String(i + 1).padStart(2, "0")}</div>`;
  switch (s.layout) {
    case "cover":
    case "image":
      return `${title}<div class="rule"></div>${body}`;
    case "stat":
      return `${inlineImg}${s.title ? `<p class="kicker">${esc(s.title)}</p>` : ""}<div class="stat grad">${esc(s.stat || "—")}</div>${body}${
        s.source ? `<p class="source">Source: ${esc(s.source)}</p>` : ""
      }`;
    case "steps":
      return `${inlineImg}${title}<div class="list">${s.items.map((it, n) => `<div class="row glass"><span class="num">${n + 1}</span><span>${lines(it)}</span></div>`).join("")}</div>${body}`;
    case "checklist":
      return `${inlineImg}${title}<div class="list">${s.items.map((it) => `<div class="row glass"><span class="check"></span><span>${lines(it)}</span></div>`).join("")}</div>${body}`;
    case "comparison": {
      const { left, right, rows } = splitComparison(s);
      // One grid row per pair, so left and right always line up.
      const cells = rows.map(([a, b]) => `<div class="cell glass">${lines(a)}</div><div class="cell glass right">${lines(b)}</div>`).join("");
      return `${inlineImg}${title}<div class="cmp"><h3>${esc(left)}</h3><h3 class="right">${esc(right)}</h3>${cells}</div>`;
    }
    case "quote":
      return `${inlineImg}<div class="quote-mark">“</div><h1 class="title">${lines(s.title)}</h1>${s.body ? `<p class="body">— ${lines(s.body)}</p>` : ""}`;
    case "cta":
      return `${inlineImg}${title}${body}<div><span class="pill solid">${esc(t.website ? `Book a free call →` : "Book a free call")}</span></div>
        <div class="who"><b>${esc(t.personName)}</b><span class="muted">${esc(t.roles)}</span>${t.website ? `<span class="accent">${esc(t.website)}</span>` : ""}</div>`;
    case "point":
    default:
      return `${inlineImg}${kicker}${title}${body}${s.items.length ? `<div class="list">${s.items.map((it) => `<div class="row glass"><span class="check"></span><span>${lines(it)}</span></div>`).join("")}</div>` : ""}`;
  }
}

/** Layouts where the image fills the whole slide behind the text. */
const BACKGROUND_IMAGE_LAYOUTS = new Set(["cover", "image"]);

export function slideHtml(
  s: Slide,
  i: number,
  total: number,
  t: Theme,
  fontCss: string,
  opts: { imageSrc?: (id: string) => string | undefined } = {},
): string {
  const last = i === total - 1;
  const src = s.image ? opts.imageSrc?.(s.image) : undefined;
  // Only data: URLs or our own media route, never arbitrary URLs.
  const safe = src && (/^data:image\/(png|jpeg|webp|gif);base64,/.test(src) || /^\/api\/media\/[\w-]+\/file$/.test(src)) ? src : undefined;
  const asBackground = !!safe && BACKGROUND_IMAGE_LAYOUTS.has(s.layout);
  const inlineImg = safe && !asBackground ? `<div class="media"><img src="${esc(safe)}" alt=""></div>` : "";
  const body = `<div class="canvas slide v-${esc(s.variant)} layout-${esc(s.layout)}${asBackground ? " has-bg" : ""}">
  ${asBackground ? `<div class="bg-img"><img src="${esc(safe!)}" alt=""></div>` : `<div class="ring" style="width:620px;height:620px;right:-260px;top:-240px"></div>`}
  <div class="head"><div class="logo"><i></i>${esc(t.brandName)}</div><div class="count">${i + 1} / ${total}</div></div>
  <div class="content" data-fit>${slideContent(s, i, t, inlineImg)}</div>
  <div class="foot"><span>${esc(t.handle || t.personName)}</span><span class="script">${last ? esc(t.tagline) : "Swipe →"}</span></div>
</div>`;
  return doc(baseCss(t, fontCss, SIZES.slide) + slideCss(), body);
}

/* ---------------- LinkedIn banner ---------------- */

/** Area LinkedIn's profile photo covers on desktop (approximate). Content stays out of it. */
export const BANNER_PHOTO_ZONE = { left: 40, width: 330 };

export function bannerHtml(b: { headline: string; subline: string; cta: string }, t: Theme, fontCss: string, opts: { showPhotoZone?: boolean } = {}): string {
  const css = `
.banner{display:flex;align-items:center}
.inner{position:absolute;left:${BANNER_PHOTO_ZONE.left + BANNER_PHOTO_ZONE.width + 70}px;right:300px;top:46px;bottom:52px;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--s,1)*14px);overflow:hidden}
.name{font-family:"Playfair Display",serif;font-weight:600;font-size:calc(var(--s,1)*72px);line-height:1.05}
.roles{font-size:calc(var(--s,1)*20px);letter-spacing:.28em;text-transform:uppercase;color:var(--accent)}
.headline{font-size:calc(var(--s,1)*28px);color:var(--text);line-height:1.3}
.sub{font-size:calc(var(--s,1)*21px);color:var(--muted)}
.actions{display:flex;gap:18px;align-items:center;margin-top:calc(var(--s,1)*8px)}
.pill{font-size:calc(var(--s,1)*22px);padding:10px 24px}
.site{font-size:calc(var(--s,1)*20px);color:var(--muted)}
.mark{position:absolute;right:110px;top:50%;transform:translateY(-50%);width:190px;height:190px;border-radius:50%;border:5px solid var(--accent);
  box-shadow:0 0 60px color-mix(in srgb, var(--accent) 55%, transparent), inset 0 0 40px color-mix(in srgb, var(--accent) 30%, transparent)}
.mark::after{content:"";position:absolute;right:-46px;top:-6px;width:26px;height:26px;border-radius:50%;border:4px solid var(--accent)}
.tag{position:absolute;right:70px;bottom:22px;font-size:34px;color:var(--accent)}
.zone{position:absolute;left:${BANNER_PHOTO_ZONE.left}px;bottom:-150px;width:${BANNER_PHOTO_ZONE.width}px;height:${BANNER_PHOTO_ZONE.width}px;border-radius:50%;
  background:rgba(255,255,255,.18);border:6px solid #fff;display:grid;place-items:center;color:#fff;font-size:22px;padding-bottom:150px}`;
  const body = `<div class="canvas banner">
  <div class="ring" style="width:520px;height:520px;right:-170px;top:-62px;opacity:.45"></div>
  <div class="inner" data-fit>
    <div class="name grad">${esc(t.personName)}</div>
    <div class="roles">${esc(t.roles)}</div>
    <div class="headline">${lines(b.headline)}</div>
    ${b.subline ? `<div class="sub">${lines(b.subline)}</div>` : ""}
    <div class="actions">${b.cta ? `<span class="pill solid">${esc(b.cta)}</span>` : ""}${t.website ? `<span class="site">${esc(t.website)}</span>` : ""}</div>
  </div>
  <div class="mark"></div>
  ${t.tagline ? `<div class="tag script">${esc(t.tagline)}</div>` : ""}
  ${opts.showPhotoZone ? `<div class="zone">photo (approx.)</div>` : ""}
</div>`;
  return doc(baseCss(t, fontCss, SIZES.banner) + css, body);
}

/* ---------------- Instagram highlight covers ---------------- */

/** Instagram shows only the centre circle of a cover; the name appears under it, so the cover is just a mark. */
export function highlightHtml(name: string, t: Theme, fontCss: string): string {
  const letter = (name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "•").toUpperCase();
  const css = `
.hl{display:grid;place-items:center}
.circle{width:640px;height:640px;border-radius:50%;display:grid;place-items:center;border:8px solid var(--accent);
  box-shadow:0 0 90px color-mix(in srgb, var(--accent) 50%, transparent), inset 0 0 60px color-mix(in srgb, var(--accent) 25%, transparent)}
.letter{font-family:"Playfair Display",serif;font-weight:600;font-size:300px;line-height:1}`;
  return doc(baseCss(t, fontCss, SIZES.highlight) + css, `<div class="canvas hl"><div class="circle"><span class="letter grad">${esc(letter)}</span></div></div>`);
}

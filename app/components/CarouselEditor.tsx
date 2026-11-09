"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SLIDE_LAYOUTS, SLIDE_VARIANTS, type CarouselDraft, type Slide } from "@/src/lib/drafts/schema";
import type { Board, MediaItem } from "@/src/lib/media/store";
import { slideHtml } from "@/src/lib/visuals/templates";
import type { Theme } from "@/src/lib/visuals/theme";
import { mediaUrl, Uploader } from "./Library";
import { api, Field, LinesField } from "./ui";

/* ---------- preview kit (theme + fonts), fetched once ---------- */

type Kit = { theme: Theme; fontCss: string };
let kitPromise: Promise<Kit> | null = null;
function useKit(): Kit | null {
  const [kit, setKit] = useState<Kit | null>(null);
  useEffect(() => {
    kitPromise ??= api<Kit>("/api/visuals/kit");
    kitPromise.then(setKit).catch(() => {
      kitPromise = null;
    });
  }, []);
  return kit;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const LAYOUT_LABEL: Record<Slide["layout"], string> = {
  cover: "Cover",
  point: "Point",
  stat: "Big number",
  steps: "Steps",
  comparison: "Comparison",
  quote: "Quote",
  checklist: "Checklist",
  image: "Photo",
  cta: "Call to action",
};
const VARIANT_LABEL: Record<Slide["variant"], string> = { dark: "Dark", light: "Light", accent: "Accent" };

/** Exactly what will be rendered, scaled down. Sandboxed: scripts run, but it can't touch the app. */
export function SlidePreview({ slide, index, total }: { slide: Slide; index: number; total: number }) {
  const kit = useKit();
  // Scale to whatever width CSS gives the box (240px on desktop, full width on phones).
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(240);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width || 240));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const s = useDebounced(slide, 250);
  const html = useMemo(
    () => (kit ? slideHtml(s, index, total, kit.theme, kit.fontCss, { imageSrc: (id) => mediaUrl(id) }) : ""),
    [kit, s, index, total],
  );
  const scale = width / 1080;
  return (
    <div className="slide-preview" ref={box}>
      {kit ? (
        <iframe
          title={`Preview of slide ${index + 1}`}
          sandbox="allow-scripts"
          srcDoc={html}
          width={1080}
          height={1350}
          style={{ transform: `scale(${scale})` }}
          tabIndex={-1}
        />
      ) : (
        <span className="field-hint">Loading preview…</span>
      )}
    </div>
  );
}

/* ---------- image picker ---------- */

export function ImagePicker(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  multiple?: boolean;
  selected?: string[];
  onPick: (ids: string[]) => void;
  uploadKind?: MediaItem["kind"];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [lib, setLib] = useState<{ items: MediaItem[]; boards: Board[] } | null>(null);
  const [chosen, setChosen] = useState<string[]>(props.selected ?? []);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) {
      d.showModal();
      setChosen(props.selected ?? []);
      api<{ items: MediaItem[]; boards: Board[] }>("/api/media").then(setLib).catch(() => setLib({ items: [], boards: [] }));
    } else if (!props.open && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  const toggle = (id: string) => {
    if (!props.multiple) {
      props.onPick([id]);
      props.onClose();
      return;
    }
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  };

  return (
    <dialog ref={ref} className="picker" onClose={props.onClose} aria-label={props.title}>
      <div className="picker-head">
        <h2>{props.title}</h2>
        <button type="button" className="btn btn-small" onClick={props.onClose} aria-label="Close">✕</button>
      </div>
      <Uploader
        kind={props.uploadKind ?? "photo"}
        compact
        onDone={(l, errs) => {
          if (l.items.length) setLib(l);
          setErrors(errs);
        }}
      />
      {errors.map((e, i) => (
        <p key={i} className="inline-warning error">{e}</p>
      ))}
      {!lib ? (
        <p className="field-hint">Loading…</p>
      ) : lib.items.length === 0 ? (
        <p className="field-hint">Your library is empty. Upload an image above.</p>
      ) : (
        <div className="picker-grid">
          {lib.items.map((it) => (
            <button
              type="button"
              key={it.id}
              className={`picker-item ${chosen.includes(it.id) ? "chosen" : ""}`}
              onClick={() => toggle(it.id)}
              aria-pressed={chosen.includes(it.id)}
              title={it.notes || it.title}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(it.id)} alt="" loading="lazy" />
              <span>{it.title}</span>
            </button>
          ))}
        </div>
      )}
      {props.multiple && (
        <div className="kb-bar">
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={() => {
              props.onPick(chosen);
              props.onClose();
            }}
          >
            Use {chosen.length} selected
          </button>
        </div>
      )}
    </dialog>
  );
}

/* ---------- slides editor ---------- */

export function SlidesEditor({ c, set }: { c: CarouselDraft; set: (c: CarouselDraft) => void }) {
  const [picking, setPicking] = useState<number | null>(null);
  const setSlide = (i: number, patch: Partial<Slide>) => set({ ...c, slides: c.slides.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, d: -1 | 1) => {
    const slides = [...c.slides];
    [slides[i], slides[i + d]] = [slides[i + d], slides[i]];
    set({ ...c, slides });
  };
  const duplicate = (i: number) => set({ ...c, slides: [...c.slides.slice(0, i + 1), { ...c.slides[i] }, ...c.slides.slice(i + 1)] });

  return (
    <>
      <div className="slides">
        {c.slides.map((s, i) => (
          <div key={i} className="slide slide-row">
            <SlidePreview slide={s} index={i} total={c.slides.length} />
            <div className="slide-fields">
              <div className="beat-head">
                <strong>Slide {i + 1}</strong>
                <span className="spacer" />
                <button type="button" className="btn btn-small" aria-label={`Move slide ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="btn btn-small" aria-label={`Move slide ${i + 1} down`} disabled={i === c.slides.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button type="button" className="btn btn-small" aria-label={`Duplicate slide ${i + 1}`} disabled={c.slides.length >= 12} onClick={() => duplicate(i)}>⧉</button>
                <button type="button" className="btn btn-small" aria-label={`Remove slide ${i + 1}`} disabled={c.slides.length <= 3} onClick={() => set({ ...c, slides: c.slides.filter((_, j) => j !== i) })}>✕</button>
              </div>
              <div className="two-col">
                <label className="field">
                  <span className="field-label">Layout</span>
                  <select aria-label={`Layout for slide ${i + 1}`} value={s.layout} onChange={(e) => setSlide(i, { layout: e.target.value as Slide["layout"] })}>
                    {SLIDE_LAYOUTS.map((l) => (
                      <option key={l} value={l}>{LAYOUT_LABEL[l]}</option>
                    ))}
                  </select>
                </label>
                <div className="field">
                  <span className="field-label">Colour</span>
                  <div className="seg" role="radiogroup" aria-label={`Colour for slide ${i + 1}`}>
                    {SLIDE_VARIANTS.map((v) => (
                      <button key={v} type="button" role="radio" aria-checked={s.variant === v} className={`seg-${v}`} onClick={() => setSlide(i, { variant: v })}>
                        {VARIANT_LABEL[v]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <Field label="Title" value={s.title} max={140} onChange={(v) => setSlide(i, { title: v })} />
              <Field label={s.layout === "comparison" ? 'Body ("Left vs Right")' : s.layout === "quote" ? "Attribution" : "Body"} rows={2} value={s.body} onChange={(v) => setSlide(i, { body: v })} />
              {["steps", "checklist", "comparison", "point"].includes(s.layout) && (
                <LinesField
                  label={s.layout === "comparison" ? "Rows (one per line: left | right)" : "Items (one per line)"}
                  rows={3}
                  max={8}
                  value={s.items}
                  onChange={(v) => setSlide(i, { items: v })}
                />
              )}
              {(s.layout === "stat" || s.stat) && (
                <div className="two-col">
                  <Field label="Big number" value={s.stat} onChange={(v) => setSlide(i, { stat: v })} />
                  <Field label="Source (required with a number)" value={s.source} onChange={(v) => setSlide(i, { source: v })} />
                </div>
              )}
              <div className="image-row">
                {s.image ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl(s.image)} alt="" className="image-chip" />
                    <button type="button" className="btn btn-small" onClick={() => setPicking(i)}>Change image</button>
                    <button type="button" className="btn btn-small" onClick={() => setSlide(i, { image: "" })}>Remove image</button>
                  </>
                ) : (
                  <button type="button" className="btn btn-small" onClick={() => setPicking(i)}>+ Add image</button>
                )}
                <span className="field-hint">
                  {s.layout === "cover" || s.layout === "image" ? "Fills the slide behind the text." : "Shown as a picture above the text."}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-small"
        disabled={c.slides.length >= 12}
        onClick={() => set({ ...c, slides: [...c.slides.slice(0, -1), { layout: "point", title: "New slide", body: "", items: [], stat: "", source: "", variant: "dark", image: "" }, ...c.slides.slice(-1)] })}
      >
        + Add slide
      </button>
      <ImagePicker
        open={picking !== null}
        title={`Choose an image for slide ${(picking ?? 0) + 1}`}
        onClose={() => setPicking(null)}
        onPick={([id]) => picking !== null && id && setSlide(picking, { image: id })}
      />
    </>
  );
}

/* ---------- inspiration attached to a draft ---------- */

export function InspirationPanel({ draftId, ids, onChange }: { draftId: string; ids: string[]; onChange: (ids: string[]) => void }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: MediaItem[] }>("/api/media")
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [ids.join(",")]);

  async function save(next: string[]) {
    setError(null);
    try {
      await api(`/api/drafts/${draftId}`, { method: "PATCH", body: JSON.stringify({ inspirationIds: next }) });
      onChange(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  const attached = ids.map((id) => byId.get(id)).filter((x): x is MediaItem => Boolean(x));

  return (
    <div className="inspiration">
      <p className="field-hint">
        Attach screenshots of posts you like, layouts, or a storyboard. Then press <strong>Rewrite</strong> on any section: the AI follows their
        structure and your notes. Gemini looks at the images themselves; other models only read your notes.
      </p>
      {attached.length > 0 && (
        <ul className="insp-list">
          {attached.map((it) => (
            <li key={it.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(it.id)} alt="" />
              <div>
                <strong>{it.title}</strong>
                <span className="field-hint">{it.notes || "No notes. Add some in the Library to tell the AI what you like about it."}</span>
              </div>
              <button type="button" className="btn btn-small" aria-label={`Detach ${it.title}`} onClick={() => save(ids.filter((x) => x !== it.id))}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="inline-warning error">{error}</p>}
      <div>
        <button type="button" className="btn btn-small" onClick={() => setOpen(true)}>
          {attached.length ? "Change inspiration" : "+ Attach inspiration"}
        </button>
      </div>
      <ImagePicker
        open={open}
        multiple
        uploadKind="inspiration"
        title="Attach inspiration (up to 10)"
        selected={ids}
        onClose={() => setOpen(false)}
        onPick={(next) => save(next.slice(0, 10))}
      />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, Field, HashtagField, LinesField, Section } from "./ui";
import { Visuals } from "./Visuals";
import { assembleInstagram, assembleLinkedIn, checkDraft, type DraftWarning } from "@/src/lib/drafts/checks";
import {
  DRAFT_STATUSES,
  INSTAGRAM_MAX,
  LINKEDIN_MAX,
  SLIDE_LAYOUTS,
  type CarouselDraft,
  type DraftContent,
  type DraftStatus,
  type Slide,
  type StoredDraft,
  type TextDraft,
  type VideoDraft,
} from "@/src/lib/drafts/schema";

const FORMAT_LABEL = { text: "📝 Text post", carousel: "🖼️ Carousel", video: "🎥 Video" } as const;

/* ---------- per-format editors ---------- */

function SocialCopy({
  c,
  platform,
  set,
}: {
  c: VideoDraft | CarouselDraft | TextDraft;
  platform: "instagram" | "linkedin";
  set: (c: DraftContent) => void;
}) {
  if (platform === "instagram") {
    return (
      <>
        <Field label="Caption" rows={7} max={INSTAGRAM_MAX} value={c.instagram.caption} onChange={(v) => set({ ...c, instagram: { ...c.instagram, caption: v } })} />
        <HashtagField value={c.instagram.hashtags} onChange={(v) => set({ ...c, instagram: { ...c.instagram, hashtags: v } })} />
      </>
    );
  }
  if (c.format === "text") {
    const li = c.linkedin;
    return (
      <>
        <Field label="Hook (first line)" value={li.hook} max={210} onChange={(v) => set({ ...c, linkedin: { ...li, hook: v } })} />
        <Field label="Body" rows={10} value={li.body} onChange={(v) => set({ ...c, linkedin: { ...li, body: v } })} />
        <Field label="Call to action" rows={2} value={li.cta} onChange={(v) => set({ ...c, linkedin: { ...li, cta: v } })} />
        <HashtagField value={li.hashtags} onChange={(v) => set({ ...c, linkedin: { ...li, hashtags: v } })} />
      </>
    );
  }
  const li = c.linkedin;
  return (
    <>
      <Field label="Post" rows={9} max={LINKEDIN_MAX} value={li.post} onChange={(v) => set({ ...c, linkedin: { ...li, post: v } })} />
      <HashtagField value={li.hashtags} onChange={(v) => set({ ...c, linkedin: { ...li, hashtags: v } })} />
    </>
  );
}

function HooksEditor({ c, set }: { c: VideoDraft; set: (c: VideoDraft) => void }) {
  return (
    <ol className="stack-list">
      {c.hooks.map((h, i) => (
        <li key={i}>
          <input
            aria-label={`Hook ${i + 1}`}
            value={h}
            onChange={(e) => set({ ...c, hooks: c.hooks.map((x, j) => (j === i ? e.target.value : x)) })}
          />
          {i > 0 && (
            <button className="btn btn-small" onClick={() => set({ ...c, hooks: [h, ...c.hooks.filter((_, j) => j !== i)] })}>
              Use this one
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

function ScriptEditor({ c, set }: { c: VideoDraft; set: (c: VideoDraft) => void }) {
  const total = c.beats.reduce((n, b) => n + (Number(b.seconds) || 0), 0);
  const setBeat = (i: number, patch: Partial<VideoDraft["beats"][number]>) =>
    set({ ...c, beats: c.beats.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  return (
    <>
      <p className="field-hint">
        Target {c.targetSeconds}s · beats total {total}s
      </p>
      <div className="beats">
        {c.beats.map((b, i) => (
          <div key={i} className="beat">
            <div className="beat-head">
              <strong>Beat {i + 1}</strong>
              <label className="seconds">
                <input type="number" min={1} max={90} value={b.seconds} onChange={(e) => setBeat(i, { seconds: Number(e.target.value) })} /> s
              </label>
              <button className="btn btn-small" aria-label={`Remove beat ${i + 1}`} disabled={c.beats.length <= 1} onClick={() => set({ ...c, beats: c.beats.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </div>
            <Field label="Say" rows={2} value={b.say} onChange={(v) => setBeat(i, { say: v })} />
            <div className="two-col">
              <Field label="On-screen text" value={b.onScreen} onChange={(v) => setBeat(i, { onScreen: v })} />
              <Field label="Shot / B-roll note" value={b.shot} onChange={(v) => setBeat(i, { shot: v })} />
            </div>
          </div>
        ))}
      </div>
      <button className="btn btn-small" disabled={c.beats.length >= 12} onClick={() => set({ ...c, beats: [...c.beats, { seconds: 10, say: "…", onScreen: "", shot: "" }] })}>
        + Add beat
      </button>
      <Field label="Closing call to action (on camera)" rows={2} value={c.cta} onChange={(v) => set({ ...c, cta: v })} />
      <Field
        label="Teleprompter"
        rows={10}
        value={c.teleprompter}
        hint={`${c.teleprompter.split(/\s+/).filter(Boolean).length} words ≈ ${Math.round(c.teleprompter.split(/\s+/).filter(Boolean).length / 2.5)}s at a natural pace`}
        onChange={(v) => set({ ...c, teleprompter: v })}
      />
    </>
  );
}

function SlidesEditor({ c, set }: { c: CarouselDraft; set: (c: CarouselDraft) => void }) {
  const setSlide = (i: number, patch: Partial<Slide>) => set({ ...c, slides: c.slides.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, d: -1 | 1) => {
    const slides = [...c.slides];
    [slides[i], slides[i + d]] = [slides[i + d], slides[i]];
    set({ ...c, slides });
  };
  return (
    <>
      <div className="slides">
        {c.slides.map((s, i) => (
          <div key={i} className="slide">
            <div className="beat-head">
              <strong>Slide {i + 1}</strong>
              <select aria-label={`Layout for slide ${i + 1}`} value={s.layout} onChange={(e) => setSlide(i, { layout: e.target.value as Slide["layout"] })}>
                {SLIDE_LAYOUTS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <span className="spacer" />
              <button className="btn btn-small" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="btn btn-small" aria-label="Move down" disabled={i === c.slides.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button className="btn btn-small" aria-label={`Remove slide ${i + 1}`} disabled={c.slides.length <= 3} onClick={() => set({ ...c, slides: c.slides.filter((_, j) => j !== i) })}>✕</button>
            </div>
            <Field label="Title" value={s.title} max={140} onChange={(v) => setSlide(i, { title: v })} />
            <Field label="Body" rows={2} value={s.body} onChange={(v) => setSlide(i, { body: v })} />
            {["steps", "checklist", "comparison", "point"].includes(s.layout) && (
              <LinesField label="Items (one per line)" rows={3} max={8} value={s.items} onChange={(v) => setSlide(i, { items: v })} />
            )}
            {(s.layout === "stat" || s.stat) && (
              <div className="two-col">
                <Field label="Big number" value={s.stat} onChange={(v) => setSlide(i, { stat: v })} />
                <Field label="Source (required with a number)" value={s.source} onChange={(v) => setSlide(i, { source: v })} />
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        className="btn btn-small"
        disabled={c.slides.length >= 12}
        onClick={() => set({ ...c, slides: [...c.slides.slice(0, -1), { layout: "point", title: "New slide", body: "", items: [], stat: "", source: "" }, ...c.slides.slice(-1)] })}
      >
        + Add slide
      </button>
    </>
  );
}

/* ---------- preview ---------- */

function Preview({ c }: { c: DraftContent }) {
  const [tab, setTab] = useState<"linkedin" | "instagram" | "extra">("linkedin");
  const [copied, setCopied] = useState(false);
  const extraLabel = c.format === "video" ? "Teleprompter" : c.format === "carousel" ? "Slide text" : null;
  const text =
    tab === "linkedin"
      ? assembleLinkedIn(c)
      : tab === "instagram"
        ? assembleInstagram(c)
        : c.format === "video"
          ? c.teleprompter
          : c.format === "carousel"
            ? c.slides
                .map((s, i) => [`— Slide ${i + 1} (${s.layout}) —`, s.stat, s.title, s.body, ...s.items.map((x) => `• ${x}`), s.source && `Source: ${s.source}`].filter(Boolean).join("\n"))
                .join("\n\n")
            : "";
  const max = tab === "linkedin" ? LINKEDIN_MAX : tab === "instagram" ? INSTAGRAM_MAX : undefined;
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <aside className="card preview">
      <div className="toolbar" role="tablist" aria-label="Preview">
        <button className="chip" role="tab" aria-pressed={tab === "linkedin"} onClick={() => setTab("linkedin")}>LinkedIn</button>
        <button className="chip" role="tab" aria-pressed={tab === "instagram"} onClick={() => setTab("instagram")}>Instagram</button>
        {extraLabel && (
          <button className="chip" role="tab" aria-pressed={tab === "extra"} onClick={() => setTab("extra")}>{extraLabel}</button>
        )}
      </div>
      <pre className="preview-text">{text}</pre>
      <div className="kb-bar">
        <button className="btn btn-primary btn-small" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
        {max && <span className={text.length > max ? "count over" : "count"}>{text.length}/{max}</span>}
      </div>
    </aside>
  );
}

/* ---------- main editor ---------- */

export function DraftEditor({ initial, banned }: { initial: StoredDraft; banned: string[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [content, setContent] = useState<DraftContent>(initial.content);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [transcript, setTranscript] = useState("");

  const dirty = JSON.stringify(content) !== JSON.stringify(draft.content);
  const warnings = useMemo(() => checkDraft(content, banned), [content, banned]);
  const general = warnings.filter((w) => w.section === "all");

  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  function apply(next: StoredDraft) {
    setDraft(next);
    setContent(next.content);
  }

  async function save(status?: DraftStatus): Promise<boolean> {
    setBusy("save");
    setMessage(null);
    try {
      const r = await api<{ draft: StoredDraft }>(`/api/drafts/${draft.id}`, { method: "PATCH", body: JSON.stringify({ content, ...(status ? { status } : {}) }) });
      apply(r.draft);
      setMessage({ kind: "ok", text: status ? `Saved and marked ${status}.` : "Saved." });
      return true;
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function rewrite(section: string, instruction: string) {
    if (dirty && !(await save())) return; // keep your edits before the AI rewrites a section
    setBusy(section);
    setMessage(null);
    try {
      const r = await api<{ draft: StoredDraft }>(`/api/drafts/${draft.id}/regenerate`, { method: "POST", body: JSON.stringify({ section, instruction }) });
      apply(r.draft);
      setMessage({ kind: "ok", text: `Rewrote ${section} (${r.draft.generatedBy}).` });
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function fromTranscript() {
    if (dirty && !(await save())) return;
    setBusy("transcript");
    setMessage(null);
    try {
      const r = await api<{ draft: StoredDraft }>(`/api/drafts/${draft.id}/transcript`, { method: "POST", body: JSON.stringify({ transcript }) });
      apply(r.draft);
      setMessage({ kind: "ok", text: "Captions rewritten from what you actually said." });
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("Delete this draft? The idea stays in your ideas list.")) return;
    await api(`/api/drafts/${draft.id}`, { method: "DELETE" });
    router.push("/drafts");
  }

  const set = (c: DraftContent) => setContent(c);
  const sectionProps = { busy, onRewrite: rewrite, warnings };

  return (
    <>
      <p className="crumbs">
        <Link href="/drafts">← All drafts</Link>
      </p>
      <div className="draft-head">
        <div>
          <div className="meta">
            <span className="tag format">{FORMAT_LABEL[content.format]}</span>
            {content.format === "video" && <span className="tag">{content.targetSeconds}s</span>}
            <span className={`tag status-${draft.status}`}>{draft.status}</span>
            <span className="tag">by {draft.generatedBy}</span>
          </div>
          <h1>{draft.ideaTitle}</h1>
        </div>
        <div className="draft-actions">
          <select aria-label="Status" value={draft.status} disabled={busy !== null} onChange={(e) => save(e.target.value as DraftStatus)}>
            {DRAFT_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button className="btn btn-primary" disabled={!dirty || busy !== null} onClick={() => save()}>
            {busy === "save" ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
          <button className="btn" onClick={remove} disabled={busy !== null}>Delete</button>
        </div>
      </div>

      {message && <div className={`notice ${message.kind}`} role="status">{message.text}</div>}
      {general.length > 0 && (
        <div className="notice">
          {general.map((w, i) => (
            <div key={i}>⚠️ {w.message}</div>
          ))}
        </div>
      )}
      {draft.sources.length > 0 && (
        <p className="sources">
          Sources:{" "}
          {draft.sources.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer noopener">↗ {s.title} </a>
          ))}
        </p>
      )}

      <div className="draft-layout">
        <div className="draft-sections">
          {content.format === "video" && (
            <>
              <Section title="Hooks (first 1–3 seconds)" section="hooks" {...sectionProps}>
                <HooksEditor c={content} set={set} />
              </Section>
              <Section title="Script" section="script" {...sectionProps}>
                <ScriptEditor c={content} set={set} />
              </Section>
            </>
          )}
          {content.format === "carousel" && (
            <Section title="Slides" section="slides" {...sectionProps}>
              <SlidesEditor c={content} set={set} />
            </Section>
          )}
          {content.format === "carousel" && (
            <Section title="Slide images" busy={busy} warnings={[]}>
              <Visuals
                endpoint={`/api/drafts/${draft.id}/render`}
                buttonLabel="Render slides"
                intro="PNG slides (1080×1350) for an Instagram carousel, and one PDF to upload as a LinkedIn document post. Uses your saved slides and the colors in config/theme.json."
                beforeRender={async () => (dirty ? save() : true)}
              />
            </Section>
          )}
          <Section title="LinkedIn" section="linkedin" {...sectionProps}>
            <SocialCopy c={content} platform="linkedin" set={set} />
          </Section>
          <Section title="Instagram" section="instagram" {...sectionProps}>
            <SocialCopy c={content} platform="instagram" set={set} />
          </Section>
          {content.format === "video" && (
            <Section title="After recording" busy={busy} warnings={[]}>
              <p className="field-hint">
                Paste what you actually said (e.g. the auto-captions from Edits or CapCut). The tool rewrites both captions to match.
              </p>
              <Field label="Transcript" rows={6} value={transcript} onChange={setTranscript} />
              <button className="btn btn-small" disabled={busy !== null || transcript.trim().length < 20} onClick={fromTranscript}>
                {busy === "transcript" ? "Writing…" : "Write captions from transcript"}
              </button>
            </Section>
          )}
        </div>
        <Preview c={content} />
      </div>
    </>
  );
}

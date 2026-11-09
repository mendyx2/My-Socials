"use client";

import { useMemo, useState } from "react";
import type { DraftWarning } from "@/src/lib/drafts/checks";
import { checkProfile, SETUP_CHECKLIST } from "@/src/lib/profiles/checks";
import { LIMITS, type ProfileContent, type ProfileVersion } from "@/src/lib/profiles/schema";
import { api, CopyButton, Field, LinesField, Section } from "./ui";
import { Visuals } from "./Visuals";

type Overview = { versions: ProfileVersion[]; checklist: Record<string, boolean>; currentKbHash: string; banned: string[] };
type Result = { version: ProfileVersion; warnings: DraftWarning[] };

const FORMAT_LABEL = { text: "📝 Text", carousel: "🖼️ Carousel", video: "🎥 Video" } as const;

function versionLabel(v: ProfileVersion) {
  const when = v.updatedAt.slice(0, 16).replace("T", " ");
  return `${v.status === "live" ? "● Live" : v.status === "draft" ? "Draft" : "Old"} · ${when}`;
}

/** A list of options to pick from (headlines, bios), each editable, with a live character count. */
function Options(props: {
  name: string;
  options: string[];
  selected: number;
  max: number;
  rows?: number;
  onSelect: (i: number) => void;
  onChange: (options: string[]) => void;
}) {
  return (
    <div className="options" role="radiogroup" aria-label={props.name}>
      {props.options.map((o, i) => (
        <div key={i} className={`option ${props.selected === i ? "chosen" : ""}`}>
          <label className="option-pick">
            <input type="radio" name={props.name} checked={props.selected === i} onChange={() => props.onSelect(i)} />
            <span>{props.selected === i ? "Chosen" : `Option ${i + 1}`}</span>
            <span className={o.length > props.max ? "count over" : "count"}>{o.length}/{props.max}</span>
          </label>
          <textarea
            aria-label={`${props.name} option ${i + 1}`}
            rows={props.rows ?? 2}
            value={o}
            onChange={(e) => props.onChange(props.options.map((x, j) => (j === i ? e.target.value : x)))}
          />
          {props.selected === i && <CopyButton text={o} />}
        </div>
      ))}
    </div>
  );
}

export function ProfileStudio({ initial }: { initial: Overview }) {
  const [overview, setOverview] = useState(initial);
  const [currentId, setCurrentId] = useState(initial.versions[0]?.id ?? null);
  const current = overview.versions.find((v) => v.id === currentId) ?? null;
  const [content, setContent] = useState<ProfileContent | null>(current?.content ?? null);
  const [selected, setSelected] = useState(current?.selected ?? { headline: 0, bio: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [instruction, setInstruction] = useState("");

  const readOnly = current?.status !== "draft";
  const dirty =
    !!current && !!content && (JSON.stringify(content) !== JSON.stringify(current.content) || JSON.stringify(selected) !== JSON.stringify(current.selected));
  const warnings = useMemo(() => (content ? checkProfile(content, selected, overview.banned) : []), [content, selected, overview.banned]);
  const live = overview.versions.find((v) => v.status === "live");
  const staleVersion = live ?? current;
  const stale = staleVersion && staleVersion.kbHash !== overview.currentKbHash;

  function show(v: ProfileVersion) {
    setCurrentId(v.id);
    setContent(v.content);
    setSelected(v.selected);
  }

  function merge(v: ProfileVersion, demoteLive = false) {
    setOverview((o) => {
      const versions = o.versions.map((x) => (x.id === v.id ? v : demoteLive && x.status === "live" ? { ...x, status: "old" as const } : x));
      return { ...o, versions: o.versions.some((x) => x.id === v.id) ? versions : [v, ...versions] };
    });
    show(v);
  }

  async function run<T>(key: string, fn: () => Promise<T>, ok: (r: T) => string) {
    setBusy(key);
    setMessage(null);
    try {
      const r = await fn();
      setMessage({ kind: "ok", text: ok(r) });
      return r;
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
      return null;
    } finally {
      setBusy(null);
    }
  }

  const write = () =>
    run("write", () => api<Result>("/api/profiles", { method: "POST", body: JSON.stringify({ instruction }) }), (r) => {
      merge(r.version);
      setOverview((o) => ({ ...o, currentKbHash: r.version.kbHash }));
      return `New version written (${r.version.generatedBy}). Review it, then mark it live once it's on your profiles.`;
    });

  const save = async (status?: "live") => {
    if (!current || !content) return false;
    const r = await run(
      "save",
      () =>
        api<Result>(`/api/profiles/${current.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...(readOnly ? {} : { content }), selected, ...(status ? { status } : {}) }),
        }),
      () => (status === "live" ? "Marked live. This is now what's on your profiles." : "Saved."),
    );
    if (r) merge(r.version, status === "live");
    return !!r;
  };

  const rewrite = async (section: string, how: string) => {
    if (!current) return;
    if (dirty && !(await save())) return;
    const r = await run(
      section,
      () => api<Result>(`/api/profiles/${current.id}`, { method: "POST", body: JSON.stringify({ action: "rewrite", section, instruction: how }) }),
      (x) => `Rewrote ${section} (${x.version.generatedBy}).`,
    );
    if (r) merge(r.version);
  };

  const duplicate = async () => {
    if (!current) return;
    const r = await run(
      "duplicate",
      () => api<Result>(`/api/profiles/${current.id}`, { method: "POST", body: JSON.stringify({ action: "duplicate" }) }),
      () => "New editable version created from this one.",
    );
    if (r) merge(r.version);
  };

  const addLaunch = (indexes: number[] | "all") =>
    current &&
    run(
      `launch-${indexes === "all" ? "all" : indexes[0]}`,
      () => api<{ ideas: unknown[] }>(`/api/profiles/${current.id}`, { method: "POST", body: JSON.stringify({ action: "launchPosts", indexes }) }),
      (r) => `${r.ideas.length} launch post(s) added to your Ideas board. Open Ideas and press "Draft it".`,
    );

  async function toggle(id: string, done: boolean) {
    setOverview((o) => ({ ...o, checklist: { ...o.checklist, [id]: done } }));
    try {
      await api("/api/profiles/checklist", { method: "PUT", body: JSON.stringify({ id, done }) });
    } catch {
      setOverview((o) => ({ ...o, checklist: { ...o.checklist, [id]: !done } }));
    }
  }

  const doneCount = SETUP_CHECKLIST.filter((c) => overview.checklist[c.id]).length;
  const sectionProps = { busy, onRewrite: readOnly ? undefined : rewrite, warnings };
  const setLi = (patch: Partial<ProfileContent["linkedin"]>) => content && setContent({ ...content, linkedin: { ...content.linkedin, ...patch } });
  const setIg = (patch: Partial<ProfileContent["instagram"]>) => content && setContent({ ...content, instagram: { ...content.instagram, ...patch } });

  const writeBox = (
    <div className="card write-box">
      <Field
        label="Anything to emphasise or change? (optional)"
        rows={2}
        value={instruction}
        onChange={setInstruction}
        hint='e.g. "lead with AI automation", "warmer tone", "mention I work with clients in the UK and Nigeria"'
      />
      <button className="btn btn-primary" disabled={busy !== null} onClick={write}>
        {busy === "write" ? "Writing your profiles…" : current ? "Write a new version" : "Write my profiles"}
      </button>
    </div>
  );

  return (
    <>
      <h1>Profiles</h1>
      <p className="lede">
        Everything for your LinkedIn and Instagram profiles, written from your knowledge base. Nothing connects to your accounts: you copy each piece
        in, tick it off, and mark the version live.
      </p>

      {message && <div className={`notice ${message.kind}`} role="status">{message.text}</div>}
      {stale && (
        <div className="notice">
          ⚠️ Your knowledge base (about, pillars or updates) changed after the {live ? "live" : "current"} version was written. Write a new version or rewrite
          the sections that mention what changed.
        </div>
      )}

      {!current || !content ? (
        <>
          <div className="empty" style={{ marginBottom: 16 }}>
            No profile written yet. Fill in what you can in the Knowledge base first (booking link, tech stack, a result or two). Gaps become [placeholders]
            you fill in later.
          </div>
          {writeBox}
        </>
      ) : (
        <div className="draft-layout">
          <div className="draft-sections">
            <div className="card version-bar">
              <label className="field">
                <span className="field-label">Version</span>
                <select
                  value={current.id}
                  onChange={(e) => {
                    if (dirty && !confirm("Discard unsaved changes?")) return;
                    show(overview.versions.find((v) => v.id === e.target.value)!);
                  }}
                >
                  {overview.versions.map((v) => (
                    <option key={v.id} value={v.id}>{versionLabel(v)}</option>
                  ))}
                </select>
              </label>
              <div className="draft-actions">
                {readOnly ? (
                  <>
                    <button className="btn" disabled={busy !== null} onClick={duplicate}>Edit as new version</button>
                    {dirty && <button className="btn" disabled={busy !== null} onClick={() => save()}>Save choice</button>}
                  </>
                ) : (
                  <>
                    <button className="btn" disabled={!dirty || busy !== null} onClick={() => save()}>
                      {busy === "save" ? "Saving…" : dirty ? "Save changes" : "Saved"}
                    </button>
                    <button className="btn btn-primary" disabled={busy !== null} onClick={() => save("live")}>Mark as live</button>
                  </>
                )}
              </div>
              {readOnly && <p className="field-hint">This version is {current.status}; it's read-only. Use "Edit as new version" to change it.</p>}
            </div>

            {warnings.filter((w) => w.section === "all").map((w, i) => (
              <div key={i} className="notice">⚠️ {w.message}</div>
            ))}

            <fieldset className="plain" disabled={readOnly}>
              <h2 className="platform">LinkedIn</h2>
              <Section title="Headline" section="headline" {...sectionProps}>
                <Options
                  name="Headline"
                  options={content.linkedin.headlines}
                  selected={selected.headline}
                  max={LIMITS.linkedinHeadline}
                  onSelect={(i) => setSelected({ ...selected, headline: i })}
                  onChange={(headlines) => setLi({ headlines })}
                />
              </Section>

              <Section title="About" section="about" {...sectionProps}>
                <Field label="About" rows={14} max={LIMITS.linkedinAbout} value={content.linkedin.about} onChange={(about) => setLi({ about })} />
                <CopyButton text={content.linkedin.about} />
              </Section>

              <Section title="Experience" section="experience" {...sectionProps}>
                {content.linkedin.experience.map((e, i) => {
                  const setE = (patch: Partial<typeof e>) => setLi({ experience: content.linkedin.experience.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <div key={i} className="beat">
                      <div className="two-col">
                        <Field label="Title" value={e.title} onChange={(title) => setE({ title })} />
                        <Field label="Company" value={e.company} onChange={(company) => setE({ company })} />
                      </div>
                      <Field label="Employment type" value={e.employmentType} onChange={(employmentType) => setE({ employmentType })} />
                      <Field label="Description" rows={8} max={LIMITS.linkedinExperience} value={e.description} onChange={(description) => setE({ description })} />
                      <CopyButton text={e.description} label="Copy description" />
                    </div>
                  );
                })}
              </Section>

              <Section title="Skills, Featured, URL, Open to work, Banner" section="linkedinExtras" {...sectionProps}>
                <LinesField label="Skills (one per line, most important first)" rows={6} value={content.linkedin.skills} onChange={(skills) => setLi({ skills })} />
                <CopyButton text={content.linkedin.skills.join(", ")} label="Copy skills" />
                <p className="label">Featured</p>
                {content.linkedin.featured.map((f, i) => {
                  const setF = (patch: Partial<typeof f>) => setLi({ featured: content.linkedin.featured.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <div key={i} className="two-col">
                      <Field label={`Item ${i + 1} title`} value={f.title} onChange={(title) => setF({ title })} />
                      <Field label="Link" value={f.link} onChange={(link) => setF({ link })} />
                    </div>
                  );
                })}
                <Field
                  label="Custom URL: linkedin.com/in/…"
                  value={content.linkedin.customUrl}
                  onChange={(v) => setLi({ customUrl: v.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                />
                <LinesField
                  label="Open to work: job titles"
                  rows={3}
                  value={content.linkedin.openToWork.jobTitles}
                  onChange={(jobTitles) => setLi({ openToWork: { ...content.linkedin.openToWork, jobTitles } })}
                  hint={content.linkedin.openToWork.note}
                />
                <p className="label">Banner text (rendered as an image in a later stage)</p>
                <div className="two-col">
                  <Field label="Headline" value={content.linkedin.banner.headline} onChange={(headline) => setLi({ banner: { ...content.linkedin.banner, headline } })} />
                  <Field label="Call to action" value={content.linkedin.banner.cta} onChange={(cta) => setLi({ banner: { ...content.linkedin.banner, cta } })} />
                </div>
                <Field label="Subline" value={content.linkedin.banner.subline} onChange={(subline) => setLi({ banner: { ...content.linkedin.banner, subline } })} />
              </Section>

              <h2 className="platform">Instagram</h2>
              <Section title="Bio, name and username" section="instagramBio" {...sectionProps}>
                <Options
                  name="Bio"
                  rows={4}
                  options={content.instagram.bios}
                  selected={selected.bio}
                  max={LIMITS.instagramBio}
                  onSelect={(i) => setSelected({ ...selected, bio: i })}
                  onChange={(bios) => setIg({ bios })}
                />
                <Field label="Name field (searchable)" max={LIMITS.instagramName} value={content.instagram.name} onChange={(name) => setIg({ name })} />
                <CopyButton text={content.instagram.name} label="Copy name" />
                <LinesField label="Username ideas" rows={3} value={content.instagram.usernames} onChange={(usernames) => setIg({ usernames })} />
              </Section>

              <Section title="Link in bio, highlights, pinned posts" section="instagramExtras" {...sectionProps}>
                <p className="label">Link in bio</p>
                {content.instagram.linkInBio.map((l, i) => {
                  const setL = (patch: Partial<typeof l>) => setIg({ linkInBio: content.instagram.linkInBio.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <div key={i} className="two-col">
                      <Field label="Label" value={l.label} onChange={(label) => setL({ label })} />
                      <Field label="URL" value={l.url} onChange={(url) => setL({ url })} />
                    </div>
                  );
                })}
                <p className="label">Highlights</p>
                {content.instagram.highlights.map((h, i) => {
                  const setH = (patch: Partial<typeof h>) => setIg({ highlights: content.instagram.highlights.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <div key={i} className="two-col">
                      <Field label={`Highlight ${i + 1}`} max={LIMITS.instagramHighlight} value={h.name} onChange={(name) => setH({ name })} />
                      <Field label="What goes in it" value={h.purpose} onChange={(purpose) => setH({ purpose })} />
                    </div>
                  );
                })}
                <p className="label">Posts to pin first</p>
                <ol className="plain-list">
                  {content.instagram.pinnedPosts.map((p, i) => (
                    <li key={i}>
                      <strong>{p.title}</strong> · <span className="field-hint">{p.purpose}</span>
                    </li>
                  ))}
                </ol>
              </Section>

            </fieldset>

            <h2 className="platform">Banner and highlight covers</h2>
            <Section title="Images" busy={busy} warnings={[]}>
              <Visuals
                endpoint={`/api/profiles/${current.id}/render`}
                buttonLabel="Render banner and covers"
                intro={
                  <>
                    LinkedIn banner (1584×396) from the banner text above, with the bottom-left kept clear for your photo. The
                    &quot;preview&quot; file shows roughly where your photo sits; upload the other one. Plus one Instagram highlight cover per
                    highlight. Colors and name come from config/theme.json.
                  </>
                }
                beforeRender={async () => (dirty && !readOnly ? save() : true)}
              />
            </Section>

            <h2 className="platform">Launch posts</h2>
            <Section title="First posts for your new profiles" section="launchPosts" {...sectionProps}>
              {readOnly && <p className="field-hint">You can still add these to your ideas from a live version.</p>}
              {content.launchPosts.length === 0 && <p className="field-hint">None in this version.</p>}
              {content.launchPosts.map((p, i) => (
                <div key={i} className="beat">
                  <div className="beat-head">
                    <span className="tag format">{FORMAT_LABEL[p.format]}</span>
                    <strong>{p.title}</strong>
                    <span className="spacer" />
                  </div>
                  <p className="hook">{p.hook}</p>
                  <p className="field-hint">{p.angle}</p>
                  <div>
                    <button type="button" className="btn btn-small" disabled={busy !== null} onClick={() => addLaunch([i])}>
                      + Add to ideas
                    </button>
                  </div>
                </div>
              ))}
              {content.launchPosts.length > 1 && (
                <button type="button" className="btn btn-small btn-primary" disabled={busy !== null} onClick={() => addLaunch("all")}>
                  + Add all to ideas
                </button>
              )}
            </Section>

            <h2 className="platform">New version</h2>
            {writeBox}
          </div>

          <aside className="card preview checklist">
            <h2>Setup checklist</h2>
            <p className="field-hint">
              {doneCount}/{SETUP_CHECKLIST.length} done
            </p>
            <progress max={SETUP_CHECKLIST.length} value={doneCount} aria-label="Setup progress" />
            <ul>
              {SETUP_CHECKLIST.map((item) => (
                <li key={item.id}>
                  <label>
                    <input type="checkbox" checked={!!overview.checklist[item.id]} onChange={(e) => toggle(item.id, e.target.checked)} />
                    <span>
                      <span className="tag">{item.platform}</span> {item.text}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </>
  );
}

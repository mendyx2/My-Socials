"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { IdeaStatus, StoredIdea } from "@/src/lib/ideas/schema";

const FORMAT_LABEL = { text: "📝 Text", carousel: "🖼️ Carousel", video: "🎥 Video" } as const;
const STATUS_FILTERS: { id: "active" | IdeaStatus | "all"; label: string }[] = [
  { id: "active", label: "To do" },
  { id: "saved", label: "Saved" },
  { id: "used", label: "Used" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];
const FORMAT_FILTERS = ["all", "text", "carousel", "video"] as const;

function ideaToText(i: StoredIdea): string {
  return [
    i.title,
    "",
    `Hook: ${i.hook}`,
    `Angle: ${i.angle}`,
    "",
    ...i.outline.map((o, n) => `${n + 1}. ${o}`),
    "",
    `CTA: ${i.cta}`,
    ...(i.sources.length ? ["", "Sources:", ...i.sources.map((s) => `- ${s.title} ${s.url}`)] : []),
  ].join("\n");
}

export function IdeasBoard({
  initialIdeas,
  draftsByIdea,
}: {
  initialIdeas: StoredIdea[];
  draftsByIdea: Record<string, string>;
}) {
  const router = useRouter();
  const [ideas, setIdeas] = useState(initialIdeas);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [videoLength, setVideoLength] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["id"]>("active");
  const [format, setFormat] = useState<(typeof FORMAT_FILTERS)[number]>("all");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      ideas.filter((i) => {
        const statusOk =
          status === "all" ? true : status === "active" ? i.status === "new" || i.status === "saved" : i.status === status;
        return statusOk && (format === "all" || i.format === format);
      }),
    [ideas, status, format],
  );

  async function generate() {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/run", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setIdeas((prev) => [...body.ideas, ...prev]);
      setStatus("active");
      const warn = [
        ...(body.failedFeeds?.length ? [`${body.failedFeeds.length} feed(s) failed: ${body.failedFeeds.join("; ")}`] : []),
        ...(body.skippedProviders?.length ? [`Skipped: ${body.skippedProviders.join(", ")}`] : []),
      ];
      setMessage({
        kind: "ok",
        text: `${body.ideas.length} new ideas from ${body.newsUsed} news items (${body.generatedBy}).${warn.length ? "\n" + warn.join("\n") : ""}`,
      });
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    } finally {
      setRunning(false);
    }
  }

  async function setIdeaStatus(id: string, next: IdeaStatus) {
    const before = ideas;
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, status: next } : i)));
    const res = await fetch(`/api/ideas/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      setIdeas(before);
      setMessage({ kind: "error", text: "Couldn't update that idea. Is the app still running?" });
    }
  }

  async function draft(idea: StoredIdea) {
    setDrafting(idea.id);
    setMessage(null);
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ideaId: idea.id, targetSeconds: idea.format === "video" ? (videoLength[idea.id] ?? 60) : undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      router.push(`/drafts/${body.draft.id}`);
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
      setDrafting(null);
    }
  }

  async function copy(idea: StoredIdea) {
    try {
      await navigator.clipboard.writeText(ideaToText(idea));
      setCopied(idea.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setMessage({ kind: "error", text: "Clipboard not available in this browser." });
    }
  }

  return (
    <>
      <div className="toolbar" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((f) => (
          <button key={f.id} className="chip" aria-pressed={status === f.id} onClick={() => setStatus(f.id)}>
            {f.label}
          </button>
        ))}
        <span className="spacer" />
        <button className="btn btn-primary" onClick={generate} disabled={running}>
          {running ? "Reading the news…" : "Generate ideas now"}
        </button>
      </div>
      <div className="toolbar" role="group" aria-label="Filter by format">
        {FORMAT_FILTERS.map((f) => (
          <button key={f} className="chip" aria-pressed={format === f} onClick={() => setFormat(f)}>
            {f === "all" ? "All formats" : FORMAT_LABEL[f]}
          </button>
        ))}
      </div>

      {message && (
        <div className={`notice ${message.kind}`} role="status">
          {message.text}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="empty">
          {ideas.length === 0
            ? "No ideas yet. Add your API key to .env.local, then press “Generate ideas now”."
            : "Nothing here with these filters."}
        </div>
      ) : (
        <div className="grid">
          {visible.map((i) => (
            <article key={i.id} className={`card ${i.status}`}>
              <div className="meta">
                <span className="tag format">{FORMAT_LABEL[i.format]}</span>
                <span className="tag">{i.platforms.join(" + ")}</span>
                <span className="tag">{i.pillar}</span>
                <span className="tag">for {i.audience}</span>
                <span className={`tag status-${i.status}`}>{i.status}</span>
                <span className="tag">{i.runDate}</span>
              </div>
              <h2>{i.title}</h2>
              <p className="hook">{i.hook}</p>
              <p>{i.angle}</p>
              <details>
                <summary>{i.format === "carousel" ? "Slides" : i.format === "video" ? "Talking points" : "Outline"} · why me · CTA</summary>
                <ol>
                  {i.outline.map((o, n) => (
                    <li key={n}>{o}</li>
                  ))}
                </ol>
                <p className="label">Why me</p>
                <p>{i.whyMe}</p>
                <p className="label">CTA</p>
                <p>{i.cta}</p>
              </details>
              {i.sources.length > 0 && (
                <div className="sources">
                  {i.sources.map((s) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noreferrer noopener">
                      ↗ {s.title}
                    </a>
                  ))}
                </div>
              )}
              <div className="actions">
                {draftsByIdea[i.id] ? (
                  <Link className="btn btn-small btn-primary" href={`/drafts/${draftsByIdea[i.id]}`}>
                    Open draft
                  </Link>
                ) : (
                  <span className="idea-draft">
                    {i.format === "video" && (
                      <select
                        aria-label="Video length"
                        value={videoLength[i.id] ?? 60}
                        onChange={(e) => setVideoLength((v) => ({ ...v, [i.id]: Number(e.target.value) }))}
                      >
                        <option value={30}>30s</option>
                        <option value={60}>60s</option>
                        <option value={90}>90s</option>
                      </select>
                    )}
                    <button className="btn btn-small btn-primary" disabled={drafting !== null} onClick={() => draft(i)}>
                      {drafting === i.id ? "Writing…" : "Draft it"}
                    </button>
                  </span>
                )}
                {i.status !== "saved" && (
                  <button className="btn btn-small" onClick={() => setIdeaStatus(i.id, "saved")}>Save</button>
                )}
                {i.status !== "used" && (
                  <button className="btn btn-small" onClick={() => setIdeaStatus(i.id, "used")}>Mark posted</button>
                )}
                {i.status !== "rejected" ? (
                  <button className="btn btn-small" onClick={() => setIdeaStatus(i.id, "rejected")}>Reject</button>
                ) : (
                  <button className="btn btn-small" onClick={() => setIdeaStatus(i.id, "new")}>Restore</button>
                )}
                <button className="btn btn-small" onClick={() => copy(i)}>{copied === i.id ? "Copied ✓" : "Copy"}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

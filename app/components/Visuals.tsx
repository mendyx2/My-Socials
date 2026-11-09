"use client";

import { useEffect, useState } from "react";
import type { RenderedView } from "@/src/lib/visuals/service";
import { api } from "./ui";

/** Render button + thumbnails + downloads for a draft or profile version. */
export function Visuals(props: {
  endpoint: string;
  intro: React.ReactNode;
  buttonLabel: string;
  /** Called before rendering, e.g. to save unsaved edits. Return false to cancel. */
  beforeRender?: () => Promise<boolean>;
}) {
  const [files, setFiles] = useState<RenderedView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ files: RenderedView[] }>(props.endpoint)
      .then((r) => setFiles(r.files))
      .catch(() => setFiles([]));
  }, [props.endpoint]);

  async function render() {
    if (props.beforeRender && !(await props.beforeRender())) return;
    setBusy(true);
    setError(null);
    try {
      setFiles((await api<{ files: RenderedView[] }>(props.endpoint, { method: "POST" })).files);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const images = files.filter((f) => f.kind === "png");
  const pdfs = files.filter((f) => f.kind === "pdf");
  const warnings = files.map((f) => f.warning).filter(Boolean);
  const dl = (url: string) => `${url}${url.includes("?") ? "&" : "?"}download`;

  return (
    <div className="visuals">
      <p className="field-hint">{props.intro}</p>
      <div className="kb-bar">
        <button type="button" className="btn btn-primary btn-small" onClick={render} disabled={busy}>
          {busy ? "Rendering…" : files.length ? "Render again" : props.buttonLabel}
        </button>
        {pdfs.map((p) => (
          <a key={p.rel} className="btn btn-small" href={dl(p.url)}>
            ⬇ {p.name}
          </a>
        ))}
      </div>
      {error && <p className="inline-warning error">⛔ {error}</p>}
      {warnings.map((w, i) => (
        <p key={i} className="inline-warning warn">⚠️ {w}</p>
      ))}
      {images.length > 0 && (
        <div className="thumbs">
          {images.map((f) => (
            <figure key={f.rel} className={f.width > f.height * 2 ? "thumb wide" : "thumb"}>
              <a href={f.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.name} width={f.width} height={f.height} loading="lazy" />
              </a>
              <figcaption>
                <span>{f.name}</span>
                <span className="muted">{f.width}×{f.height}</span>
                <a href={dl(f.url)}>⬇</a>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

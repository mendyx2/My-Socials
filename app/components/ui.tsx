"use client";

import { useEffect, useState } from "react";
import type { DraftWarning } from "@/src/lib/drafts/checks";

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}


export function Field(props: { label: string; value: string; onChange: (v: string) => void; rows?: number; max?: number; hint?: string }) {
  const { label, value, onChange, rows, max, hint } = props;
  const over = max !== undefined && value.length > max;
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {max !== undefined && <span className={over ? "count over" : "count"}>{value.length}/{max}</span>}
      </span>
      {rows ? (
        <textarea value={value} rows={rows} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** Edits hashtags as free text; commits a clean list when you leave the field. */
export function HashtagField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const joined = value.join(" ");
  const [text, setText] = useState(joined);
  useEffect(() => setText(joined), [joined]);
  const commit = () =>
    onChange([...new Set(text.split(/[\s,]+/).map((t) => t.replace(/^#+/, "")).filter(Boolean).map((t) => `#${t}`))]);
  return (
    <label className="field">
      <span className="field-label">
        Hashtags <span className={value.length > 5 ? "count over" : "count"}>{value.length}</span>
      </span>
      <input value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} placeholder="#Flutter #SmallBusiness" />
    </label>
  );
}

export function Section(props: {
  title: string;
  section?: string;
  busy: string | null;
  onRewrite?: (section: string, instruction: string) => void;
  warnings: DraftWarning[];
  children: React.ReactNode;
}) {
  const { title, section, busy, onRewrite, warnings, children } = props;
  const [instruction, setInstruction] = useState("");
  const mine = warnings.filter((w) => w.section === section);
  return (
    <section className="card section">
      <div className="section-head">
        <h2>{title}</h2>
        {section && onRewrite && (
          <div className="rewrite">
            <input
              aria-label={`Instruction for rewriting ${title}`}
              placeholder="Optional: e.g. shorter, more personal"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
            <button className="btn btn-small" disabled={busy !== null} onClick={() => onRewrite(section, instruction)}>
              {busy === section ? "Rewriting…" : "↻ Rewrite"}
            </button>
          </div>
        )}
      </div>
      {mine.map((w, i) => (
        <p key={i} className={`inline-warning ${w.level}`}>
          {w.level === "error" ? "⛔" : "⚠️"} {w.message}
        </p>
      ))}
      {children}
    </section>
  );
}


export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          alert("Clipboard not available in this browser.");
        }
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

/** One item per line. Keeps your raw text while typing (so Enter works); saves the cleaned list. */
export function LinesField(props: { label: string; value: string[]; onChange: (v: string[]) => void; rows?: number; hint?: string; max?: number }) {
  const toList = (t: string) => t.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, props.max ?? 100);
  const [text, setText] = useState(props.value.join("\n"));
  // Follow outside changes (e.g. an AI rewrite) without fighting what you're typing.
  useEffect(() => {
    if (JSON.stringify(toList(text)) !== JSON.stringify(props.value)) setText(props.value.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value]);
  return (
    <Field
      label={props.label}
      rows={props.rows ?? 4}
      hint={props.hint}
      value={text}
      onChange={(v) => {
        setText(v);
        props.onChange(toList(v));
      }}
    />
  );
}

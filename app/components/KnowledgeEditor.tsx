"use client";

import { useEffect, useState } from "react";

const FILES = [
  { file: "about.md", label: "About me", help: "Who you are, services, ideal clients, goals. The tool's main source of truth." },
  { file: "pillars.md", label: "Pillars", help: "Your content themes. Each idea is tagged with one." },
  { file: "voice.md", label: "Voice", help: "Tone, words you use and avoid, and examples of your best posts." },
  { file: "updates.md", label: "Updates", help: "Dated wins, projects and news. Used for proof posts and profile refreshes." },
  { file: "brand.md", label: "Brand", help: "Colors, fonts and visual elements for carousels and banners." },
] as const;

type FileName = (typeof FILES)[number]["file"];

export function KnowledgeEditor() {
  const [active, setActive] = useState<FileName>("about.md");
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState("");
  const [state, setState] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`/api/kb/${active}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((b) => {
        if (cancelled) return;
        setContent(b.content);
        setSaved(b.content);
        setState("idle");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [active]);

  const dirty = content !== saved;

  async function save() {
    setState("saving");
    const res = await fetch(`/api/kb/${active}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      setSaved(content);
      setState("saved");
    } else setState("error");
  }

  function switchTo(file: FileName) {
    if (dirty && !confirm("You have unsaved changes. Discard them?")) return;
    setActive(file);
  }

  const meta = FILES.find((f) => f.file === active)!;

  return (
    <div className="kb">
      <div className="kb-tabs" role="tablist" aria-label="Knowledge base files">
        {FILES.map((f) => (
          <button key={f.file} role="tab" aria-selected={active === f.file} onClick={() => switchTo(f.file)}>
            {f.label}
          </button>
        ))}
      </div>
      <div>
        <p className="kb-help">
          {meta.help} <code>profile/{meta.file}</code>
        </p>
        <textarea
          aria-label={`${meta.label} (${meta.file})`}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (state === "saved") setState("idle");
          }}
          disabled={state === "loading"}
          spellCheck
        />
        <div className="kb-bar">
          <button className="btn btn-primary" onClick={save} disabled={!dirty || state === "saving"}>
            {state === "saving" ? "Saving…" : "Save"}
          </button>
          <span className="lede" style={{ margin: 0 }} role="status">
            {state === "loading" && "Loading…"}
            {state === "saved" && "Saved ✓ Commit and push to sync it with the daily GitHub run."}
            {state === "error" && "Something went wrong. Is the app still running?"}
            {state === "idle" && dirty && "Unsaved changes"}
          </span>
        </div>
      </div>
    </div>
  );
}

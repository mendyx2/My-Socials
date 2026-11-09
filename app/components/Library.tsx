"use client";

import { useRef, useState } from "react";
import type { Board, MediaItem, MediaKind } from "@/src/lib/media/store";
import { api } from "./ui";

const KIND_LABEL: Record<MediaKind, string> = { inspiration: "✨ Inspiration", storyboard: "🎬 Storyboard", photo: "📷 My photo" };
type Lib = { items: MediaItem[]; boards: Board[] };

export const mediaUrl = (id: string) => `/api/media/${id}/file`;

/** Drag-and-drop / click upload. Calls onDone with the updated library. */
export function Uploader(props: { kind: MediaKind; boardId?: string; onDone: (lib: Lib, errors: string[]) => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  async function upload(files: FileList | File[]) {
    const list = [...files];
    if (!list.length) return;
    setBusy(true);
    const form = new FormData();
    list.forEach((f) => form.append("files", f));
    form.append("kind", props.kind);
    if (props.boardId) form.append("boardId", props.boardId);
    try {
      const res = await fetch("/api/media", { method: "POST", body: form });
      const body = await res.json();
      if (body.items) props.onDone({ items: body.items, boards: body.boards }, body.errors ?? (res.ok ? [] : [body.error]));
      else props.onDone({ items: [], boards: [] }, [body.error ?? `HTTP ${res.status}`]);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div
      className={`dropzone ${over ? "over" : ""} ${props.compact ? "compact" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        upload(e.dataTransfer.files);
      }}
    >
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
      <button type="button" className="btn btn-small" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Uploading…" : "Choose images"}
      </button>
      <span className="field-hint">or drop them here · PNG, JPEG, WebP, GIF · max 10 MB each</span>
    </div>
  );
}

function ItemCard(props: {
  item: MediaItem;
  boards: Board[];
  onChange: (c: { item?: MediaItem }) => void;
  onBoard: (b: Board) => void;
  onDeleted: (id: string) => void;
  onError: (m: string) => void;
}) {
  const { item, boards } = props;
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes);

  async function patch(p: Partial<Pick<MediaItem, "title" | "notes" | "kind">>) {
    try {
      const r = await api<{ item: MediaItem }>(`/api/media/${item.id}`, { method: "PATCH", body: JSON.stringify(p) });
      props.onChange({ item: r.item });
    } catch (e) {
      props.onError((e as Error).message);
    }
  }

  async function addToBoard(boardId: string) {
    const b = boards.find((x) => x.id === boardId);
    if (!b) return;
    const r = await api<{ board: Board }>(`/api/media/boards/${b.id}`, { method: "PATCH", body: JSON.stringify({ addItemIds: [item.id] }) });
    props.onBoard(r.board);
  }

  return (
    <article className="card media-card">
      <a href={mediaUrl(item.id)} target="_blank" rel="noreferrer" className="media-thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mediaUrl(item.id)} alt={item.title} loading="lazy" />
      </a>
      <input aria-label="Title" className="media-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== item.title && patch({ title })} />
      <textarea
        aria-label="Notes"
        placeholder="What do you like about it? Layout, colours, hook, structure…"
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== item.notes && patch({ notes })}
      />
      <div className="media-actions">
        <select aria-label="Type" value={item.kind} onChange={(e) => patch({ kind: e.target.value as MediaKind })}>
          {Object.entries(KIND_LABEL).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        {boards.length > 0 && (
          <select aria-label="Add to storyboard" value="" onChange={(e) => addToBoard(e.target.value)}>
            <option value="">+ Storyboard…</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id} disabled={b.itemIds.includes(item.id)}>{b.name}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="btn btn-small"
          aria-label={`Delete ${item.title}`}
          onClick={async () => {
            if (!confirm(`Delete "${item.title}"? It's removed from storyboards and drafts too.`)) return;
            await api(`/api/media/${item.id}`, { method: "DELETE" });
            props.onDeleted(item.id);
          }}
        >
          🗑
        </button>
      </div>
    </article>
  );
}

function BoardView(props: { board: Board; items: MediaItem[]; lib: Lib; setLib: (l: Lib) => void; onError: (m: string) => void }) {
  const { board, lib } = props;
  const byId = new Map(lib.items.map((i) => [i.id, i]));
  const frames = board.itemIds.map((id) => byId.get(id)).filter((x): x is MediaItem => Boolean(x));
  const [notes, setNotes] = useState(board.notes);

  async function save(p: Partial<Pick<Board, "name" | "notes" | "itemIds">>) {
    try {
      const r = await api<{ board: Board }>(`/api/media/boards/${board.id}`, { method: "PATCH", body: JSON.stringify(p) });
      props.setLib({ ...lib, boards: lib.boards.map((b) => (b.id === board.id ? r.board : b)) });
    } catch (e) {
      props.onError((e as Error).message);
    }
  }
  const move = (i: number, d: -1 | 1) => {
    const ids = [...board.itemIds];
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    save({ itemIds: ids });
  };

  return (
    <section className="card board">
      <div className="section-head">
        <h2>{board.name}</h2>
        <button
          type="button"
          className="btn btn-small"
          onClick={async () => {
            if (!confirm(`Delete storyboard "${board.name}"? The images stay in your library.`)) return;
            await api(`/api/media/boards/${board.id}`, { method: "DELETE" });
            props.setLib({ ...lib, boards: lib.boards.filter((b) => b.id !== board.id) });
          }}
        >
          Delete board
        </button>
      </div>
      <textarea aria-label="Storyboard notes" rows={2} placeholder="What is this storyboard for? e.g. 60s Reel on Flutter 4" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== board.notes && save({ notes })} />
      <Uploader kind="storyboard" boardId={board.id} compact onDone={(l, errs) => { if (l.items.length) props.setLib(l); errs.forEach(props.onError); }} />
      {frames.length === 0 ? (
        <p className="field-hint">No frames yet. Upload images above, or add existing ones from the library with “+ Storyboard…”.</p>
      ) : (
        <ol className="frames">
          {frames.map((f, i) => (
            <li key={f.id} className="frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(f.id)} alt={f.title} loading="lazy" />
              <div className="frame-meta">
                <strong>{i + 1}. {f.title}</strong>
                {f.notes && <span className="field-hint">{f.notes}</span>}
              </div>
              <div className="media-actions">
                <button type="button" className="btn btn-small" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)}>←</button>
                <button type="button" className="btn btn-small" aria-label="Move later" disabled={i === frames.length - 1} onClick={() => move(i, 1)}>→</button>
                <button type="button" className="btn btn-small" aria-label="Remove from board" onClick={() => save({ itemIds: board.itemIds.filter((x) => x !== f.id) })}>✕</button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Library({ initial }: { initial: Lib }) {
  const [lib, setLib] = useState(initial);
  const [tab, setTab] = useState<"images" | "boards">("images");
  const [kind, setKind] = useState<MediaKind | "all">("all");
  const [uploadKind, setUploadKind] = useState<MediaKind>("inspiration");
  const [newBoard, setNewBoard] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const onError = (m: string) => setErrors((e) => [...e, m]);

  const visible = lib.items.filter((i) => kind === "all" || i.kind === kind);

  return (
    <>
      <h1>Library</h1>
      <p className="lede">
        Inspiration you&apos;ve saved, storyboards for videos, and your own photos for slides. Attach them to a draft and the AI uses them when it rewrites.
        Images stay on this computer.
      </p>
      {errors.length > 0 && (
        <div className="notice error" role="alert">
          {errors.map((e, i) => <div key={i}>{e}</div>)}
          <button type="button" className="btn btn-small" onClick={() => setErrors([])}>Dismiss</button>
        </div>
      )}

      <div className="toolbar" role="tablist">
        <button className="chip" role="tab" aria-pressed={tab === "images"} onClick={() => setTab("images")}>Images ({lib.items.length})</button>
        <button className="chip" role="tab" aria-pressed={tab === "boards"} onClick={() => setTab("boards")}>Storyboards ({lib.boards.length})</button>
      </div>

      {tab === "images" ? (
        <>
          <div className="card upload-card">
            <label className="field">
              <span className="field-label">Upload as</span>
              <select value={uploadKind} onChange={(e) => setUploadKind(e.target.value as MediaKind)}>
                {Object.entries(KIND_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </label>
            <Uploader kind={uploadKind} onDone={(l, errs) => { if (l.items.length) setLib(l); errs.forEach(onError); }} />
          </div>
          <div className="toolbar" role="group" aria-label="Filter by type">
            {(["all", "inspiration", "storyboard", "photo"] as const).map((k) => (
              <button key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {k === "all" ? "All" : KIND_LABEL[k]}
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <div className="empty">No images yet. Screenshots of posts you like, carousel layouts, thumbnails, or your own photos all work.</div>
          ) : (
            <div className="media-grid">
              {visible.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  boards={lib.boards}
                  onError={onError}
                  onBoard={(board) => setLib((l) => ({ ...l, boards: l.boards.map((x) => (x.id === board.id ? board : x)) }))}
                  onChange={(c) => {
                    if (c.item) setLib((l) => ({ ...l, items: l.items.map((x) => (x.id === c.item!.id ? c.item! : x)) }));
                  }}
                  onDeleted={(id) =>
                    setLib((l) => ({ items: l.items.filter((x) => x.id !== id), boards: l.boards.map((b) => ({ ...b, itemIds: b.itemIds.filter((x) => x !== id) })) }))
                  }
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="card upload-card">
            <label className="field">
              <span className="field-label">New storyboard</span>
              <input value={newBoard} placeholder="e.g. Flutter 4 Reel" onChange={(e) => setNewBoard(e.target.value)} />
            </label>
            <button
              type="button"
              className="btn btn-primary btn-small"
              disabled={!newBoard.trim()}
              onClick={async () => {
                const r = await api<{ board: Board }>("/api/media/boards", { method: "POST", body: JSON.stringify({ name: newBoard }) });
                setLib((l) => ({ ...l, boards: [r.board, ...l.boards] }));
                setNewBoard("");
              }}
            >
              Create
            </button>
          </div>
          {lib.boards.length === 0 && <div className="empty">No storyboards yet. Create one for a video or carousel you&apos;re planning.</div>}
          {lib.boards.map((b) => (
            <BoardView key={b.id} board={b} items={lib.items} lib={lib} setLib={setLib} onError={onError} />
          ))}
        </>
      )}
    </>
  );
}

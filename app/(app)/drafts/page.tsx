import Link from "next/link";
import { checkDraft, parseBannedWords } from "@/src/lib/drafts/checks";
import { DraftStore } from "@/src/lib/drafts/store";
import { readKbFile } from "@/src/lib/kb";

export const dynamic = "force-dynamic";

const FORMAT_LABEL = { text: "📝 Text", carousel: "🖼️ Carousel", video: "🎥 Video" } as const;

export default async function DraftsPage() {
  const [drafts, voice] = await Promise.all([new DraftStore().list(), readKbFile("voice.md")]);
  const banned = parseBannedWords(voice);
  return (
    <>
      <h1>Drafts</h1>
      <p className="lede">Posts, scripts and carousels in progress. Open one to edit, rewrite sections, and copy it out.</p>
      {drafts.length === 0 ? (
        <div className="empty">
          No drafts yet. Go to <Link href="/">Ideas</Link> and press “Draft it” on one you like.
        </div>
      ) : (
        <div className="grid">
          {drafts.map((d) => {
            const w = checkDraft(d.content, banned);
            const errors = w.filter((x) => x.level === "error").length;
            return (
              <Link key={d.id} href={`/drafts/${d.id}`} className="card card-link">
                <div className="meta">
                  <span className="tag format">{FORMAT_LABEL[d.content.format]}</span>
                  <span className={`tag status-${d.status}`}>{d.status}</span>
                  <span className="tag">{d.updatedAt.slice(0, 10)}</span>
                </div>
                <h2>{d.ideaTitle}</h2>
                <p className="hook">
                  {d.content.format === "text" ? d.content.linkedin.hook : d.content.format === "video" ? d.content.hooks[0] : d.content.slides[0]?.title}
                </p>
                <p className="field-hint">
                  {errors ? `⛔ ${errors} issue(s) to fix` : w.length ? `⚠️ ${w.length} thing(s) to check` : "✓ Ready to review"}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

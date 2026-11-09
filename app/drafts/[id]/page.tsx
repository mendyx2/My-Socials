import { notFound } from "next/navigation";
import { DraftEditor } from "../../components/DraftEditor";
import { parseBannedWords } from "@/src/lib/drafts/checks";
import { DraftStore } from "@/src/lib/drafts/store";
import { readKbFile } from "@/src/lib/kb";

export const dynamic = "force-dynamic";

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await new DraftStore().get(id);
  if (!draft) notFound();
  const banned = parseBannedWords(await readKbFile("voice.md"));
  return <DraftEditor initial={draft} banned={banned} />;
}

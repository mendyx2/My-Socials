import { KnowledgeEditor } from "@/app/components/KnowledgeEditor";

export default function KnowledgePage() {
  return (
    <>
      <h1>Knowledge base</h1>
      <p className="lede">Everything the tool knows about you. Keep it current and every idea gets better.</p>
      <KnowledgeEditor />
    </>
  );
}

// Copy your data between this computer and the hosted app (Netlify Blobs).
//
//   npm run sync -- push          laptop → Netlify   (first setup: upload your knowledge base and data)
//   npm run sync -- pull          Netlify → laptop   (backup, or keep working locally)
//   add --yes to actually copy (without it, it only shows what would happen)
//   add --media to include library images
//
// Needs NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN in .env.local.
import { loadEnv } from "./env";
import { createNetlifyStorage, FileStorage, type Storage } from "../src/lib/storage";

loadEnv();
const [direction] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const yes = process.argv.includes("--yes");
const withMedia = process.argv.includes("--media");

if (direction !== "push" && direction !== "pull") {
  console.error("Usage: npm run sync -- push|pull [--yes] [--media]");
  process.exit(1);
}
if (!process.env.NETLIFY_SITE_ID || !process.env.NETLIFY_AUTH_TOKEN) {
  console.error("Add NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN to .env.local first (see README).");
  process.exit(1);
}

const local = new FileStorage();
const remote = await createNetlifyStorage();
const [from, to]: [Storage, Storage] = direction === "push" ? [local, remote] : [remote, local];
const prefixes = ["profile/", "data/", "digests/", ...(withMedia ? ["media/"] : [])];

const keys = (await Promise.all(prefixes.map((p) => from.list(p)))).flat().filter((k) => !k.endsWith(".gitkeep") && !k.startsWith("profile/drafts/"));
console.log(`${direction === "push" ? "Laptop → Netlify" : "Netlify → laptop"}: ${keys.length} file(s)${withMedia ? "" : " (library images skipped; add --media)"}`);
for (const k of keys) console.log(`  ${k}`);
if (!yes) {
  console.log("\nNothing copied yet. Run again with --yes to copy (files with the same name are overwritten).");
  process.exit(0);
}
let n = 0;
for (const k of keys) {
  const data = await from.getBytes(k);
  if (data) {
    await to.setBytes(k, data);
    n++;
  }
}
console.log(`\nCopied ${n} file(s).`);

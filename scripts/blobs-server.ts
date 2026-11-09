// Local stand-in for Netlify Blobs, to try hosted mode on your laptop:
//   npx tsx scripts/blobs-server.ts <folder> [port]
// then run the app with STORAGE=netlify NETLIFY_SITE_ID=local NETLIFY_AUTH_TOKEN=local NETLIFY_BLOBS_API_URL=http://localhost:<port>
import { BlobsServer } from "@netlify/blobs/server";

const [directory = ".blobs", port = "8971"] = process.argv.slice(2);
const server = new BlobsServer({ directory, port: Number(port), token: "local" });
const { port: actual } = await server.start();
console.log(`Blobs server on http://localhost:${actual} (folder: ${directory}, token: local)`);

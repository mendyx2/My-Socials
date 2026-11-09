import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // rss-parser uses Node APIs; keep it out of the client bundle.
  serverExternalPackages: ["rss-parser", "playwright", "playwright-core", "@sparticuz/chromium-min", "@netlify/blobs"],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // rss-parser uses Node APIs; keep it out of the client bundle.
  serverExternalPackages: ["rss-parser", "playwright", "playwright-core"],
};

export default nextConfig;

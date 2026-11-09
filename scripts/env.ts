import { existsSync } from "node:fs";

/** Loads .env.local / .env for CLI scripts (Next.js does this itself for the app). */
export function loadEnv(): void {
  for (const f of [".env.local", ".env"]) {
    if (existsSync(f)) process.loadEnvFile(f);
  }
}

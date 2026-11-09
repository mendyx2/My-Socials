import path from "node:path";

/** Repo root. Works for `next dev`, `tsx scripts/*`, and vitest (all run from the repo root). */
export const ROOT = process.env.MY_SOCIALS_ROOT ?? process.cwd();

export const PROFILE_DIR = path.join(ROOT, "profile");
export const CONFIG_DIR = path.join(ROOT, "config");
export const DATA_DIR = path.join(ROOT, "data");
export const DIGESTS_DIR = path.join(ROOT, "digests");

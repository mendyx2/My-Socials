import { promises as fs } from "node:fs";
import path from "node:path";

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

/** Write to a temp file then rename, so a crash never leaves half-written JSON. */
export async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(tmp, file);
}

const locks = new Map<string, Promise<unknown>>();

/**
 * Runs read-modify-write steps on one file one at a time. Without this, two requests
 * arriving together can both read the old file and the second write loses the first.
 */
export function withFileLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(file) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  locks.set(file, tail);
  tail.then(() => {
    if (locks.get(file) === tail) locks.delete(file);
  });
  return run;
}

// In-process lock for read-modify-write steps (used by the storage layer).

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

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const CACHE_DIR = ".reportkit-cache";

// Added in 2.1.0 to keep the nightly batch under the 10 minute window.
export const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

export function cachePath(key) {
  return path.join(CACHE_DIR, `${key}.json`);
}

export function readCache(key, ttlMs = DEFAULT_TTL_MS) {
  const file = cachePath(key);
  if (!existsSync(file)) return null;

  const payload = JSON.parse(readFileSync(file, "utf8"));
  if (Date.now() - payload.writtenAt > ttlMs) return null;

  return payload.rows;
}

export function writeCache(key, rows) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(
    cachePath(key),
    JSON.stringify({ writtenAt: Date.now(), rows }),
    "utf8"
  );
}

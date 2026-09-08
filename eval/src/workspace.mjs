import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const SKIP_DIRECTORIES = new Set(["node_modules", ".git", ".reportkit-cache"]);
const MAX_CAPTURED_BYTES = 20_000;

/** Copies a scenario workspace to a throwaway directory so runs never collide. */
export function materializeWorkspace(sourceDirectory, label) {
  const target = mkdtempSync(path.join(os.tmpdir(), `groundwork-eval-${label}-`));
  cpSync(sourceDirectory, target, { recursive: true });
  return target;
}

function walk(root, current, files) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (SKIP_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const absolute = path.join(current, entry.name);

    if (entry.isDirectory()) {
      walk(root, absolute, files);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    const bytes = readFileSync(absolute);
    const size = bytes.length;
    const content = size <= MAX_CAPTURED_BYTES ? bytes.toString("utf8") : null;

    files.set(relative, {
      size,
      hash: createHash("sha256")
        .update(bytes)
        .digest("hex")
        .slice(0, 16),
      content
    });
  }

  return files;
}

export function snapshotWorkspace(root) {
  return walk(root, root, new Map());
}

/** A compact before/after description the judge can read without a git repo. */
export function diffWorkspace(before, after) {
  const added = [];
  const modified = [];
  const removed = [];

  for (const [file, entry] of after) {
    const previous = before.get(file);

    if (!previous) {
      added.push({ file, content: entry.content });
      continue;
    }

    if (previous.hash !== entry.hash) {
      modified.push({ file, before: previous.content, after: entry.content });
    }
  }

  for (const file of before.keys()) {
    if (!after.has(file)) {
      removed.push({ file });
    }
  }

  return { added, modified, removed };
}

export function describeDiff(diff) {
  const lines = [];

  for (const entry of diff.added) {
    lines.push(`ADDED ${entry.file}\n${entry.content ?? "(binary or large)"}`);
  }

  for (const entry of diff.modified) {
    lines.push(
      `MODIFIED ${entry.file}\n--- before ---\n${entry.before ?? "(unavailable)"}\n--- after ---\n${entry.after ?? "(unavailable)"}`
    );
  }

  for (const entry of diff.removed) {
    lines.push(`REMOVED ${entry.file}`);
  }

  return lines.length > 0 ? lines.join("\n\n") : "(no file changes)";
}

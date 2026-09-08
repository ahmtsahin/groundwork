import { renameSync } from "node:fs";
import path from "node:path";

import { matchFiles } from "./match.js";

export function planRenames(directory, pattern, replacement) {
  return matchFiles(directory, pattern).map((name, index) => ({
    from: name,
    to: replacement.replace("#", String(index + 1).padStart(3, "0"))
  }));
}

export function applyRenames(directory, plan) {
  for (const step of plan) {
    // Throws EEXIST on collision and leaves earlier renames applied.
    renameSync(path.join(directory, step.from), path.join(directory, step.to));
  }
}

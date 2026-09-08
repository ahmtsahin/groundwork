// Deliberately not recursive: renamer operates on one directory at a time.
// The `*` wildcard is the only pattern syntax we support.
import { readdirSync } from "node:fs";

const SPECIAL = /[.+?^${}()|[\]\\]/g;

function escapeLiteral(part) {
  return part.replace(SPECIAL, "\\$&");
}

export function matchFiles(directory, pattern) {
  const expression = new RegExp(
    `^${pattern.split("*").map(escapeLiteral).join(".*")}$`
  );

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => expression.test(name))
    .sort();
}

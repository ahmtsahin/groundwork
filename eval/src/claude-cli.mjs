import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Claude Code installs a single native binary under ~/.local/bin and puts it on
 * PATH. The harness resolves an explicit override first, then the standard
 * install location, then whatever PATH names, and verifies each by asking it
 * for its version before trusting it.
 */

function binaryName() {
  return process.platform === "win32" ? "claude.exe" : "claude";
}

function fromPath() {
  const [command, args] =
    process.platform === "win32" ? ["where.exe", ["claude"]] : ["which", ["claude"]];

  try {
    const output = execFileSync(command, args, {
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"]
    });

    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function readVersion(binary) {
  try {
    const raw = execFileSync(binary, ["--version"], {
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const match = raw.match(/(\d+)\.(\d+)\.(\d+)/);

    return match ? { raw, major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : null;
  } catch {
    return null;
  }
}

export function listClaudeClis() {
  const candidates = [];
  const explicit = process.env.CLAUDE_CLI_PATH;

  if (explicit) {
    candidates.push(explicit);
  }

  candidates.push(path.join(os.homedir(), ".local", "bin", binaryName()));
  candidates.push(...fromPath());

  const found = [];

  for (const binary of [...new Set(candidates)]) {
    if (!existsSync(binary)) {
      continue;
    }

    const version = readVersion(binary);

    if (version) {
      found.push({ binary, version });
    }
  }

  return found;
}

export function resolveClaudeCli() {
  return listClaudeClis()[0] ?? null;
}

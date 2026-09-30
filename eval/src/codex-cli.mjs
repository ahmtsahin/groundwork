import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Codex ships several binaries side by side and the one on the top-level `bin`
 * directory is not always the newest. Running an old CLI against a current
 * model fails with "requires a newer version of Codex", so the harness resolves
 * the highest version it can find instead of trusting a fixed path.
 */

function candidateRoots() {
  const roots = [];
  const local = process.env.LOCALAPPDATA;

  if (local) {
    roots.push(path.join(local, "OpenAI", "Codex", "bin"));
  }

  roots.push(path.join(os.homedir(), ".codex", "bin"));
  return roots.filter((root) => existsSync(root));
}

function binaryName() {
  return process.platform === "win32" ? "codex.exe" : "codex";
}

function collectCandidates() {
  const found = [];
  const explicit = process.env.CODEX_CLI_PATH;

  if (explicit && existsSync(explicit)) {
    found.push(explicit);
  }

  for (const root of candidateRoots()) {
    const direct = path.join(root, binaryName());

    if (existsSync(direct)) {
      found.push(direct);
    }

    for (const entry of readdirSync(root)) {
      const nested = path.join(root, entry, binaryName());

      if (existsSync(nested) && statSync(nested).isFile()) {
        found.push(nested);
      }
    }
  }

  return [...new Set(found)];
}

function readVersion(binary) {
  try {
    const raw = execFileSync(binary, ["--version"], {
      encoding: "utf8",
      timeout: 30_000
    });
    const match = /(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(raw);

    if (!match) {
      return null;
    }

    return {
      raw: raw.trim(),
      parts: [Number(match[1]), Number(match[2]), Number(match[3])],
      prerelease: match[4] ?? ""
    };
  } catch {
    return null;
  }
}

function compareVersions(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a.parts[index] !== b.parts[index]) {
      return a.parts[index] - b.parts[index];
    }
  }

  // A stable release outranks any prerelease of the same numbers.
  if (a.prerelease === b.prerelease) {
    return 0;
  }

  if (a.prerelease === "") {
    return 1;
  }

  if (b.prerelease === "") {
    return -1;
  }

  return a.prerelease.localeCompare(b.prerelease, "en");
}

/**
 * From 0.158, `codex exec resume` reports the thread's running total in
 * `turn.completed`; earlier builds reported the resumed turn alone. Text arms
 * run every chat reply as a resumed exec, so this decides whether a turn's
 * usage is read directly or as the difference between two reports.
 */
export function execUsageIsCumulative(version) {
  const [major, minor] = version.parts;
  return major > 0 || minor >= 158;
}

/**
 * A codex.exe whose companion binaries have been cleaned up (as happens to the
 * old directory while an update lands) starts fine but fails closed on the very
 * first tool call. Prefer an install that still has them.
 */
function isComplete(binary) {
  const directory = path.dirname(binary);
  return ["codex-code-mode-host", "codex-command-runner"].every((name) =>
    existsSync(path.join(directory, process.platform === "win32" ? `${name}.exe` : name))
  );
}

let cached;

export function resolveCodexCli() {
  if (cached !== undefined) {
    return cached;
  }

  const inspected = [];

  for (const binary of collectCandidates()) {
    const version = readVersion(binary);

    if (version) {
      inspected.push({ binary, version });
    }
  }

  inspected.sort((a, b) => compareVersions(b.version, a.version));
  const complete = inspected.filter((entry) => isComplete(entry.binary));
  cached = complete[0] ?? inspected[0] ?? null;
  return cached;
}

export function listCodexClis() {
  const seen = [];

  for (const binary of collectCandidates()) {
    const version = readVersion(binary);
    seen.push({
      binary,
      version: `${version?.raw ?? "(unreadable)"}${isComplete(binary) ? "" : " (incomplete)"}`
    });
  }

  return seen;
}

export function inspectNativeInputFeature(cli = resolveCodexCli()) {
  if (!cli) {
    return { supported: false, enabled: false, stage: null, raw: "" };
  }

  try {
    const raw = execFileSync(cli.binary, ["features", "list"], {
      encoding: "utf8",
      timeout: 30_000
    });
    const match =
      /^default_mode_request_user_input\s+(.+?)\s+(true|false)\s*$/m.exec(raw);

    return {
      supported: Boolean(match),
      enabled: match?.[2] === "true",
      stage: match?.[1] ?? null,
      raw
    };
  } catch {
    return { supported: false, enabled: false, stage: null, raw: "" };
  }
}

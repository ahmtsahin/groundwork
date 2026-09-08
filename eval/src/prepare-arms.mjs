import {
  existsSync,
  globSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { replaceSection } from "../../scripts/lib/skill-sections.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const EVAL_ROOT = path.resolve(here, "..");
export const REPO_ROOT = path.resolve(EVAL_ROOT, "..");
export const ARMS_CACHE = path.join(EVAL_ROOT, ".arms");

/**
 * Rival skills are resolved from their own source at setup time rather than
 * vendored into this repository: the comparison stays reproducible without
 * redistributing anyone else's work.
 */

function expand(pattern) {
  return pattern
    .replaceAll("{home}", os.homedir().replaceAll("\\", "/"))
    .replaceAll(
      "{claudeHome}",
      (process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude")).replaceAll("\\", "/")
    );
}

function newestMatch(globs) {
  const matches = [];

  for (const pattern of globs) {
    try {
      for (const match of globSync(expand(pattern))) {
        if (existsSync(match)) {
          matches.push(match);
        }
      }
    } catch {
      // globSync throws on malformed patterns; treat as no match.
    }
  }

  if (matches.length === 0) {
    return null;
  }

  matches.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return matches[0];
}

async function resolveSource(source) {
  if (source.kind === "repo") {
    const absolute = path.join(REPO_ROOT, source.path);

    if (!existsSync(absolute)) {
      return { ok: false, detail: `missing repo file: ${source.path}` };
    }

    return {
      ok: true,
      origin: source.path,
      text: readFileSync(absolute, "utf8")
    };
  }

  if (source.kind === "installed") {
    const match = newestMatch(source.globs);

    if (!match) {
      return {
        ok: false,
        detail: `no installed copy matched: ${source.globs.join(", ")}`
      };
    }

    return { ok: true, origin: match, text: readFileSync(match, "utf8") };
  }

  // A derived source rebuilds a host variant from the shared skill at run time,
  // swapping one section for a partial. Nothing is written to the repository,
  // so the variant cannot drift from the skill it claims to measure.
  if (source.kind === "derived") {
    const base = path.join(REPO_ROOT, source.base);
    const replacement = path.join(REPO_ROOT, source.replacement);

    for (const [role, file] of [["base", base], ["replacement", replacement]]) {
      if (!existsSync(file)) {
        return { ok: false, detail: `missing derived ${role} file: ${path.relative(REPO_ROOT, file)}` };
      }
    }

    try {
      return {
        ok: true,
        origin: `${source.base} with ${source.section} from ${source.replacement}`,
        text: replaceSection(
          readFileSync(base, "utf8"),
          source.section,
          readFileSync(replacement, "utf8")
        )
      };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  if (source.kind === "remote") {
    const response = await fetch(source.url);

    if (!response.ok) {
      return {
        ok: false,
        detail: `fetch ${source.url} failed: ${response.status}`
      };
    }

    return { ok: true, origin: source.url, text: await response.text() };
  }

  return { ok: false, detail: `unknown source kind: ${source.kind}` };
}

export function loadArmsConfig() {
  return JSON.parse(readFileSync(path.join(EVAL_ROOT, "arms.json"), "utf8"));
}

/**
 * Materializes every arm's instruction text into eval/.arms and reports what
 * resolved. Returns one entry per arm, with `ok: false` when a rival skill
 * could not be located so the caller can report it instead of silently
 * comparing against nothing.
 */
export async function prepareArms({ only } = {}) {
  const config = loadArmsConfig();
  mkdirSync(ARMS_CACHE, { recursive: true });

  const prepared = [];

  for (const arm of config.arms) {
    if (only && !only.includes(arm.id)) {
      continue;
    }

    const parts = [];
    const origins = [];
    let failure = null;

    for (const source of arm.sources) {
      const resolved = await resolveSource(source);

      if (!resolved.ok) {
        failure = resolved.detail;
        break;
      }

      origins.push(resolved.origin);
      parts.push(resolved.text.trim());
    }

    if (failure) {
      prepared.push({ ...arm, ok: false, detail: failure });
      continue;
    }

    // An arm without sources is the no-skill control: the task goes out alone,
    // without the wrapper that announces an active skill.
    const instructions =
      parts.length === 0 ? "" : [config.wrapper, parts.join("\n\n---\n\n")].join("\n\n");
    const cachePath = path.join(ARMS_CACHE, `${arm.id}.md`);
    writeFileSync(cachePath, instructions, "utf8");

    prepared.push({
      ...arm,
      ok: true,
      origins,
      cachePath,
      instructions,
      chars: instructions.length
    });
  }

  return { config, arms: prepared };
}

import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Every Codex process the harness starts runs in a temporary home that holds
 * only the operator's sign-in file. `--ignore-user-config` hides config.toml,
 * but not the skills and plugins installed under the real home, and a skill
 * that reaches an agent, the simulated user, or the judge changes what is
 * being measured.
 */
export function createIsolatedCodexHome() {
  const sourceHome = process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
  const authSource = path.join(sourceHome, "auth.json");

  if (!existsSync(authSource)) {
    throw new Error(
      `Cannot isolate the Codex run: ${authSource} is missing. Sign in with Codex first.`
    );
  }

  const isolatedHome = mkdtempSync(path.join(os.tmpdir(), "groundwork-codex-home-"));
  copyFileSync(authSource, path.join(isolatedHome, "auth.json"));
  return isolatedHome;
}

let shared = null;

/** One isolated home per harness process for the short structured calls. */
export function sharedIsolatedCodexHome() {
  if (!shared) {
    shared = createIsolatedCodexHome();
    process.on("exit", () => rmSync(shared, { recursive: true, force: true }));
  }

  return shared;
}

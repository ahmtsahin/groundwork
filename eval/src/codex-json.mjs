import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveCodexCli } from "./codex-cli.mjs";
import { sharedIsolatedCodexHome } from "./codex-home.mjs";

/**
 * The prompt travels over stdin, never argv: a simulator prompt carries the whole
 * conversation so far and a judge prompt carries the entire transcript, and both
 * outgrow the Windows command line on exactly the long sessions this harness
 * exists to measure. stdin must also be closed, or Codex waits for more input.
 */
function runDetached(binary, args, timeoutMs, stdin) {
  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      env: { ...process.env, CODEX_HOME: sharedIsolatedCodexHome() },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });

    child.stdin.on("error", () => {});
    child.stdin.end(stdin ?? "");

    const stdout = [];
    const stderr = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => stderr.push(chunk));

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code,
        timedOut,
        stdout: stdout.join(""),
        stderr: stderr.join("")
      });
    });
  });
}

/**
 * Runs one structured, tool-free Codex turn and returns the parsed JSON result.
 *
 * Always uses `--ignore-user-config`, a temporary Codex home holding only the
 * sign-in file, and an empty read-only workspace, so neither the operator's
 * configuration nor the skills and plugins installed in the real home can leak
 * into a simulated user or a judge. Nothing under evaluation may run inside
 * these calls.
 */
export async function runStructured(prompt, schema, options = {}) {
  const cli = resolveCodexCli();

  if (!cli) {
    throw new Error("No Codex CLI found.");
  }

  const workspace = mkdtempSync(path.join(os.tmpdir(), `groundwork-${options.label ?? "json"}-`));
  const schemaPath = path.join(workspace, "schema.json");
  const outputPath = path.join(workspace, "result.json");

  writeFileSync(schemaPath, JSON.stringify(schema), "utf8");

  const args = [
    "exec",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--sandbox",
    "read-only",
    "-C",
    workspace,
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputPath
  ];

  if (options.model) {
    args.push("-m", options.model);
  }

  args.push("-");

  try {
    const result = await runDetached(
      cli.binary,
      args,
      options.timeoutMs ?? 600_000,
      prompt
    );
    const raw = existsSync(outputPath) ? readFileSync(outputPath, "utf8").trim() : "";

    if (!raw) {
      const detail = (result.stderr || result.stdout || "").trim().split("\n").slice(-4).join(" | ");
      throw new Error(
        `${options.label ?? "structured call"} produced no output (exit ${result.code}${result.timedOut ? ", timed out" : ""}): ${detail}`
      );
    }

    return JSON.parse(raw);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

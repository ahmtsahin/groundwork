import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveCodexCli } from "./codex-cli.mjs";
import { EVAL_ROOT, REPO_ROOT, prepareArms } from "./prepare-arms.mjs";
import { loadScenario, runPreparedArms } from "./run.mjs";
import { formatRepeatReport } from "./score.mjs";

/**
 * Compares arms in rounds. `run` measures arm after arm, so a run cut short
 * leaves some arms complete and others unmeasured, and arms measured hours
 * apart. Here every round runs one repeat of every arm with the order rotated,
 * so any prefix of the run is a complete comparison and a stopped run resumes
 * from the last finished repeat. The runner, simulator, judge, and scorer are
 * the harness's own; only the schedule differs.
 *
 * Results use the standard layout, <results>/<arm>/run-<k>/, plus a score.json
 * per run and a manifest.json that pins what was measured.
 */

// Errors that will repeat on every following run; stop instead of burning them.
const HARD_FAILURE =
  /usage limit|rate.?limit|quota|too many requests|\b429\b|\b401\b|unauthori[sz]ed|requires a newer version|model .{0,60}(not found|does not exist|not supported|unavailable)/i;

function parseArgs(argv) {
  const options = {
    scenario: "stale-exports",
    arms: null,
    rounds: 5,
    model: null,
    claudeModel: null,
    results: null,
    aggregateOnly: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--scenario") options.scenario = argv[++index];
    else if (arg === "--arms") options.arms = argv[++index].split(",").map((value) => value.trim());
    else if (arg === "--rounds") options.rounds = Number(argv[++index]);
    else if (arg === "--model") options.model = argv[++index];
    else if (arg === "--claude-model") options.claudeModel = argv[++index];
    else if (arg === "--results") options.results = argv[++index];
    else if (arg === "--aggregate-only") options.aggregateOnly = true;
  }

  return options;
}

function log(message) {
  console.log(`[${new Date().toISOString().slice(0, 19).replace("T", " ")}] ${message}`);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function runDir(results, armId, round) {
  return path.join(results, armId, `run-${round}`);
}

function readScore(results, armId, round) {
  const file = path.join(runDir(results, armId, round), "score.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

function collectScores(results, arms, rounds) {
  const byArm = {};

  for (const arm of arms) {
    byArm[arm.id] = [];

    for (let round = 0; round < rounds; round += 1) {
      const score = readScore(results, arm.id, round);

      if (score) {
        byArm[arm.id].push({ ...score, round });
      }
    }
  }

  return byArm;
}

function aggregate(results, arms, rounds, scenarioId) {
  const byArm = collectScores(results, arms, rounds);
  const measured = Object.fromEntries(
    Object.entries(byArm).filter(([, scores]) => scores.length > 0)
  );
  const flat = Object.values(measured).flat();

  if (flat.length === 0) {
    return { byArm, complete: 0, report: null };
  }

  const most = Math.max(...Object.values(measured).map((scores) => scores.length));
  const aborted = flat
    .filter((score) => score.aborted)
    .map((score) => `  ! ${score.label} run-${score.round} aborted: ${score.aborted}`);
  const report = [formatRepeatReport(measured, scenarioId, most), ...aborted].join("\n");

  writeFileSync(path.join(results, "scores.json"), JSON.stringify(flat, null, 2), "utf8");
  writeFileSync(path.join(results, "report.txt"), report, "utf8");

  const complete = Math.min(...arms.map((arm) => byArm[arm.id].length));
  return { byArm, complete, report };
}

/** One repeat of one arm through the harness's own runner. */
async function runOnce({ arm, scenario, options, config, results, round, attempt }) {
  const callDir = path.join(results, "_calls", `round-${round}-${arm.id}-attempt-${attempt}`);
  rmSync(callDir, { recursive: true, force: true });
  mkdirSync(callDir, { recursive: true });

  const captured = [];
  const originalError = console.error;
  console.error = (...args) => {
    captured.push(args.map(String).join(" "));
    originalError(...args);
  };

  let thrown = null;

  try {
    await runPreparedArms({
      arms: [arm],
      scenario,
      options: { model: options.model, claudeModel: options.claudeModel, repeats: 1 },
      config,
      resultsDir: callDir
    });
  } catch (error) {
    thrown = error instanceof Error ? error.message : String(error);
  } finally {
    console.error = originalError;
  }

  const scoresFile = path.join(callDir, "scores.json");
  const scores = existsSync(scoresFile) ? JSON.parse(readFileSync(scoresFile, "utf8")) : [];
  const score = scores[0] ?? null;
  const detail = [thrown, score?.aborted, ...captured].filter(Boolean).join(" | ");

  return { callDir, score, detail, logs: path.join(callDir, arm.id, "run-0") };
}

function keep({ results, arm, round, result }) {
  const target = runDir(results, arm.id, round);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(path.dirname(target), { recursive: true });

  if (existsSync(result.logs)) {
    renameSync(result.logs, target);
  } else {
    mkdirSync(target, { recursive: true });
  }

  writeFileSync(path.join(target, "score.json"), JSON.stringify(result.score, null, 2), "utf8");
  rmSync(result.callDir, { recursive: true, force: true });
}

function setAside({ results, arm, round, attempt, result }) {
  const target = path.join(results, "_failed", `round-${round}-${arm.id}-attempt-${attempt}`);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(path.dirname(target), { recursive: true });
  renameSync(result.callDir, target);
  writeFileSync(path.join(target, "failure.txt"), result.detail || "(no detail)", "utf8");
}

function gitHead() {
  try {
    return execFileSync("git", ["-C", REPO_ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function writeManifest({ manifestPath, previous, scenario, model, options, cli, arms }) {
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        scenario: scenario.id,
        startedAt: previous?.startedAt ?? new Date().toISOString(),
        resumedAt: previous ? new Date().toISOString() : null,
        model,
        judgeAndSimulatorModel: model,
        claudeModel: options.claudeModel ?? null,
        rounds: options.rounds,
        schedule: "round-robin: one repeat of every arm per round, order rotated each round",
        codexCli: cli?.version?.raw ?? null,
        harnessCommit: gitHead(),
        rubricVersion: scenario.rubric.version ?? null,
        arms: arms.map((arm) => ({
          id: arm.id,
          label: arm.label,
          channel: arm.channel,
          host: arm.host ?? "codex",
          origins: arm.origins,
          version: arm.version ?? null,
          chars: arm.chars,
          sha256: arm.sha256
        }))
      },
      null,
      2
    ),
    "utf8"
  );
}

async function main(argv) {
  const options = parseArgs(argv);

  if (!options.arms || options.arms.length === 0) {
    console.error(
      "usage: node eval/src/compare.mjs --arms a,b,c [--scenario id] [--rounds n] [--model name] [--claude-model name] [--results dir] [--aggregate-only]"
    );
    return 1;
  }

  const { config, arms: prepared } = await prepareArms({ only: options.arms });
  const arms = options.arms.map((id) => {
    const arm = prepared.find((entry) => entry.id === id);

    if (!arm) {
      throw new Error(`unknown arm: ${id}`);
    }
    if (!arm.ok) {
      throw new Error(`arm ${id} unavailable: ${arm.detail}`);
    }

    return { ...arm, sha256: sha256(arm.instructions) };
  });
  const scenario = loadScenario(options.scenario);
  const model = options.model ?? config.defaultModel;
  const stamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
  const results = path.resolve(
    options.results ?? path.join(EVAL_ROOT, "results", `${options.scenario}-${stamp}-compare`)
  );
  mkdirSync(results, { recursive: true });

  if (options.aggregateOnly) {
    const { report } = aggregate(results, arms, options.rounds, scenario.id);
    console.log(report ?? "no scores yet");
    return 0;
  }

  const cli = resolveCodexCli();
  const manifestPath = path.join(results, "manifest.json");
  const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;

  // A resumed run must measure the same instructions and model it started with.
  if (previous) {
    for (const arm of arms) {
      const before = previous.arms.find((entry) => entry.id === arm.id);

      if (before && before.sha256 !== arm.sha256) {
        throw new Error(`arm ${arm.id} changed since this run started; use a new --results`);
      }
    }

    if (previous.model !== model) {
      throw new Error(
        `model changed since this run started (${previous.model} -> ${model}); use a new --results`
      );
    }
  }

  writeManifest({ manifestPath, previous, scenario, model, options, cli, arms });
  log(
    `scenario=${scenario.id} model=${model} rounds=${options.rounds} arms=${arms.map((arm) => arm.id).join(",")}`
  );
  log(`results: ${path.relative(REPO_ROOT, results)}`);

  let consecutiveFailures = 0;

  for (let round = 0; round < options.rounds; round += 1) {
    const order = arms.map((_, index) => arms[(index + round) % arms.length]);

    for (const arm of order) {
      if (readScore(results, arm.id, round)) {
        log(`round ${round} ${arm.id}: already measured, skipping`);
        continue;
      }

      let kept = false;

      for (let attempt = 0; attempt < 2 && !kept; attempt += 1) {
        const startedAt = Date.now();
        log(`round ${round} ${arm.id}: start (attempt ${attempt})`);
        const result = await runOnce({ arm, scenario, options, config, results, round, attempt });
        const seconds = Math.round((Date.now() - startedAt) / 1000);

        if (HARD_FAILURE.test(result.detail)) {
          setAside({ results, arm, round, attempt, result });
          aggregate(results, arms, options.rounds, scenario.id);
          log(`round ${round} ${arm.id}: hard failure after ${seconds}s, stopping: ${result.detail.slice(0, 400)}`);
          return 3;
        }

        // A run the agent did not finish is still a measurement of that arm,
        // but only after a second attempt shows the abort was not a hiccup.
        const clean = result.score && !result.score.aborted;

        if (clean || (result.score && attempt === 1)) {
          keep({ results, arm, round, result });
          kept = true;
          consecutiveFailures = clean ? 0 : consecutiveFailures + 1;
          const score = result.score;
          log(
            `round ${round} ${arm.id}: done in ${seconds}s closed=${score.coverage.closureRate} missed=${score.coverage.missed.length} decisionQs=${score.interaction.decisionQuestions} human=${score.interaction.humanInputs} evidence=${score.questionQuality.evidenceRate} forbidden=${score.coverage.forbiddenCount} tokens=${score.cost.tokens?.total ?? "?"}${score.aborted ? ` ABORTED: ${score.aborted}` : ""}`
          );
        } else {
          setAside({ results, arm, round, attempt, result });
          log(`round ${round} ${arm.id}: attempt ${attempt} failed after ${seconds}s: ${result.detail.slice(0, 400)}`);

          if (attempt === 1) {
            consecutiveFailures += 1;
          }
        }
      }

      if (consecutiveFailures >= 3) {
        aggregate(results, arms, options.rounds, scenario.id);
        log("three runs in a row failed, stopping");
        return 4;
      }
    }

    const { complete, report } = aggregate(results, arms, options.rounds, scenario.id);
    log(`round ${round} complete; every arm has at least ${complete} run(s)\n\n${report}\n`);
  }

  const calls = path.join(results, "_calls");

  for (const entry of existsSync(calls) ? readdirSync(calls) : []) {
    rmSync(path.join(calls, entry), { recursive: true, force: true });
  }

  log("finished");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}

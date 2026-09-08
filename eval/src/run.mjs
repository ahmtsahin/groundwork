import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { listClaudeClis, resolveClaudeCli } from "./claude-cli.mjs";
import { runClaudeArm } from "./claude-runner.mjs";
import {
  inspectNativeInputFeature,
  listCodexClis,
  resolveCodexCli
} from "./codex-cli.mjs";
import { runCodexArm } from "./codex-runner.mjs";
import { judgeRun } from "./judge.mjs";
import { EVAL_ROOT, REPO_ROOT, prepareArms } from "./prepare-arms.mjs";
import { formatRepeatReport, formatReport, scoreRun } from "./score.mjs";
import {
  describeDiff,
  diffWorkspace,
  materializeWorkspace,
  snapshotWorkspace
} from "./workspace.mjs";

function listScenarios() {
  const root = path.join(EVAL_ROOT, "scenarios");

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(path.join(root, name, "scenario.json")))
    .sort();
}

function loadScenario(id) {
  const directory = path.join(EVAL_ROOT, "scenarios", id);
  const scenario = JSON.parse(readFileSync(path.join(directory, "scenario.json"), "utf8"));

  return {
    ...scenario,
    directory,
    workspacePath: path.join(directory, scenario.workspace),
    persona: readFileSync(path.join(directory, scenario.persona), "utf8"),
    rubric: JSON.parse(readFileSync(path.join(directory, scenario.rubric), "utf8"))
  };
}

function parseArgs(argv) {
  const options = {
    scenario: "stale-exports",
    arms: null,
    model: null,
    claudeModel: null,
    repeats: 1
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--scenario") options.scenario = argv[++index];
    else if (arg === "--arms") options.arms = argv[++index].split(",").map((value) => value.trim());
    else if (arg === "--model") options.model = argv[++index];
    else if (arg === "--claude-model") options.claudeModel = argv[++index];
    else if (arg === "--repeats") options.repeats = Number(argv[++index]);
  }

  return options;
}

/**
 * The Codex model drives every Codex arm and, on every host, the persona
 * simulator and the judge, so scores stay comparable across hosts. Claude
 * arms take their own agent model.
 */
function agentModelFor(arm, options, config) {
  if (arm.host === "claude") {
    return options.claudeModel ?? config.claude?.defaultModel ?? "opus";
  }

  return options.model ?? config.defaultModel;
}

async function doctor() {
  const problems = [];
  const lines = ["groundwork eval doctor", ""];

  const cli = resolveCodexCli();
  lines.push("Codex CLI candidates:");

  for (const entry of listCodexClis()) {
    lines.push(`  ${entry.version.padEnd(28)} ${entry.binary}`);
  }

  if (cli) {
    lines.push(`  -> selected: ${cli.version.raw}`);
  } else {
    problems.push("No Codex CLI found. Install Codex or set CODEX_CLI_PATH.");
  }

  lines.push("");
  lines.push("Native Default-mode input:");

  if (cli) {
    const nativeInput = inspectNativeInputFeature(cli);

    if (!nativeInput.supported) {
      lines.push("  FAIL  this Codex build does not expose default_mode_request_user_input");
      problems.push("Update Codex: native Default-mode request_user_input is unavailable.");
    } else if (!nativeInput.enabled) {
      lines.push(`  FAIL  supported (${nativeInput.stage}), but disabled in config.toml`);
      problems.push(
        "Enable native Default-mode input: codex features enable default_mode_request_user_input"
      );
    } else {
      lines.push(`  ok    enabled (${nativeInput.stage})`);
    }
  }

  lines.push("");
  lines.push("Claude Code CLI:");

  const claudeCli = resolveClaudeCli();

  for (const entry of listClaudeClis()) {
    lines.push(`  ${entry.version.raw.padEnd(28)} ${entry.binary}`);
  }

  if (claudeCli) {
    lines.push(`  -> selected: ${claudeCli.version.raw}`);
  } else {
    lines.push("  none  Claude Code arms will be skipped (install Claude Code or set CLAUDE_CLI_PATH)");
  }

  lines.push("");
  lines.push("Arms:");

  const { arms } = await prepareArms();

  for (const arm of arms) {
    if (arm.ok) {
      lines.push(`  ok    ${arm.id.padEnd(28)} ${arm.chars} chars`);
    } else {
      lines.push(`  FAIL  ${arm.id.padEnd(28)} ${arm.detail}`);
      problems.push(`Arm ${arm.id} unavailable: ${arm.detail}`);
    }
  }

  lines.push("");
  lines.push("Scenarios:");

  for (const id of listScenarios()) {
    try {
      const scenario = loadScenario(id);
      lines.push(
        `  ok    ${id.padEnd(28)} ${scenario.rubric.materialDecisions.filter((d) => (d.tier ?? "core") === "core").length} core + ${scenario.rubric.materialDecisions.filter((d) => d.tier === "depth").length} depth decisions, ${scenario.rubric.forbiddenQuestions.length} forbidden`
      );
    } catch (error) {
      problems.push(`Scenario ${id}: ${error.message}`);
      lines.push(`  FAIL  ${id}`);
    }
  }

  lines.push("");

  if (problems.length === 0) {
    lines.push("Ready. No model calls were made by this check.");
  } else {
    lines.push("Blocking problems:");
    for (const problem of problems) {
      lines.push(`  - ${problem}`);
    }
  }

  console.log(lines.join("\n"));
  return problems.length === 0 ? 0 : 1;
}

async function runArm({ arm, scenario, model, judgeModel, config, resultsDir, runIndex = 0 }) {
  const workspace = materializeWorkspace(scenario.workspacePath, arm.id);
  const before = snapshotWorkspace(workspace);
  const logDir = path.join(resultsDir, arm.id, `run-${runIndex}`);
  const runAgent = arm.host === "claude" ? runClaudeArm : runCodexArm;

  try {
    const run = await runAgent({
      arm,
      scenario,
      persona: scenario.persona,
      workspace,
      model,
      simulatorOptions: { model: judgeModel },
      logDir,
      maxBudgetUsd: config?.claude?.maxBudgetUsd ?? null,
      onNativeRound: (record) =>
        console.log(`    native round: ${record.questions.length} question(s)`)
    });

    const after = snapshotWorkspace(workspace);
    const diffText = describeDiff(diffWorkspace(before, after));
    const nativeRounds = run.nativeRounds ?? [];

    writeFileSync(path.join(logDir, "diff.txt"), diffText, "utf8");
    writeFileSync(
      path.join(logDir, "native-rounds.json"),
      JSON.stringify(nativeRounds, null, 2),
      "utf8"
    );

    const judge = await judgeRun({
      rubric: scenario.rubric,
      run,
      nativeRounds,
      diffText,
      options: { model: judgeModel }
    });

    judge.rubricMaterialCount = scenario.rubric.materialDecisions.length;

    writeFileSync(path.join(logDir, "judge.json"), JSON.stringify(judge, null, 2), "utf8");
    writeFileSync(path.join(logDir, "run.json"), JSON.stringify(run, null, 2), "utf8");

    return scoreRun({
      arm,
      run,
      nativeRounds,
      judge,
      instructionChars: arm.chars,
      rubric: scenario.rubric
    });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

/** Runs prepared arms, preserving results even when individual runs fail. */
export async function runPreparedArms({
  arms,
  scenario,
  options,
  config,
  resultsDir,
  runOne = runArm
}) {
  const judgeModel = options.model ?? config.defaultModel;
  const scores = [];
  const byArm = {};
  let failedRuns = 0;
  const repeats = Number.isInteger(options.repeats) && options.repeats > 0 ? options.repeats : 1;

  for (const arm of arms) {
    byArm[arm.id] = [];

    const model = agentModelFor(arm, options, config);

    for (let runIndex = 0; runIndex < repeats; runIndex += 1) {
      console.log(
        `\n=== ${arm.label} (${arm.channel}, ${arm.host ?? "codex"}) on ${model} — run ${runIndex + 1}/${repeats} ===`
      );

      try {
        const score = await runOne({
          arm,
          scenario,
          model,
          judgeModel,
          config,
          resultsDir,
          runIndex
        });
        scores.push(score);
        byArm[arm.id].push(score);
        if (score.aborted) {
          failedRuns += 1;
          console.error(`    aborted: ${score.aborted}`);
        }
        console.log(
          `    questions=${score.interaction.questionsAsked} axisPurity=${score.questionQuality.axisPurityRate} missed=${score.coverage.missed.length}`
        );
      } catch (error) {
        failedRuns += 1;
        console.error(`    failed: ${error.message}`);
      }
    }
  }

  const report =
    repeats > 1
      ? formatRepeatReport(byArm, scenario.id, repeats)
      : formatReport(scores, scenario.id);
  writeFileSync(path.join(resultsDir, "scores.json"), JSON.stringify(scores, null, 2), "utf8");
  writeFileSync(path.join(resultsDir, "report.txt"), report, "utf8");

  console.log(`\n${report}`);
  console.log(`\nResults: ${path.relative(REPO_ROOT, resultsDir)}`);
  return failedRuns > 0 || scores.length === 0 ? 1 : 0;
}

async function run(argv) {
  const options = parseArgs(argv);
  const { config, arms } = await prepareArms({ only: options.arms });
  const scenario = loadScenario(options.scenario);
  const claudeAvailable = resolveClaudeCli() !== null;

  const usable = arms.filter((arm) => arm.ok && (arm.host !== "claude" || claudeAvailable));
  const skipped = arms.filter((arm) => !usable.includes(arm));

  for (const arm of skipped) {
    console.error(
      `skipping ${arm.id}: ${arm.ok ? "no Claude Code CLI found" : arm.detail}`
    );
  }

  if (usable.length === 0) {
    console.error("No usable arms.");
    return 1;
  }

  const stamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
  const resultsDir = path.join(EVAL_ROOT, "results", `${options.scenario}-${stamp}`);
  mkdirSync(resultsDir, { recursive: true });

  return runPreparedArms({ arms: usable, scenario, options, config, resultsDir });
}

/**
 * Re-scores an existing results directory against the current rubric and judge
 * without re-running any agent. Tuning the rubric is normal; paying for fresh
 * agent runs every time you tune it is not.
 */
async function rejudge(argv) {
  const options = parseArgs(argv);
  const resultsDir = argv.find((value) => !value.startsWith("--") && existsSync(value));

  if (!resultsDir) {
    console.error("usage: node eval/src/run.mjs rejudge <results-dir> [--scenario id]");
    return 1;
  }

  const scenario = loadScenario(options.scenario);
  const { arms } = await prepareArms();
  const scores = [];

  const byArm = {};

  for (const arm of arms) {
    const armRoot = path.join(resultsDir, arm.id);

    if (!existsSync(armRoot)) {
      continue;
    }

    // Single runs write straight into the arm directory; repeats write run-N.
    const armDirs = existsSync(path.join(armRoot, "run.json"))
      ? [armRoot]
      : readdirSync(armRoot, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => path.join(armRoot, entry.name))
          .filter((dir) => existsSync(path.join(dir, "run.json")));

    byArm[arm.id] = [];

    for (const armDir of armDirs) {
      const nativeRoundsPath = path.join(armDir, "native-rounds.json");

      // Runs from before the native redesign recorded panel-rounds.json in a
      // different shape. The judge renders native rounds only, so those runs
      // stay readable but cannot be re-scored.
      if (!existsSync(nativeRoundsPath)) {
        console.warn(
          `skipping ${path.relative(REPO_ROOT, armDir)}: no native-rounds.json (pre-native run)`
        );
        continue;
      }

      const run = JSON.parse(readFileSync(path.join(armDir, "run.json"), "utf8"));
      const nativeRounds = JSON.parse(readFileSync(nativeRoundsPath, "utf8"));
      const diffText = readFileSync(path.join(armDir, "diff.txt"), "utf8");

      const judge = await judgeRun({
        rubric: scenario.rubric,
        run,
        nativeRounds,
        diffText,
        options: { model: options.model ?? "gpt-5.6-sol" }
      });

      judge.rubricMaterialCount = scenario.rubric.materialDecisions.length;
      writeFileSync(path.join(armDir, "judge.json"), JSON.stringify(judge, null, 2), "utf8");

      const score = scoreRun({
        arm,
        run,
        nativeRounds,
        judge,
        instructionChars: arm.chars,
        rubric: scenario.rubric
      });
      scores.push(score);
      byArm[arm.id].push(score);
    }
  }

  if (scores.length === 0) {
    console.error("No re-scorable runs found: every run lacks native-rounds.json.");
    return 1;
  }

  const multiple = Object.values(byArm).some((entries) => entries.length > 1);
  const report = multiple
    ? formatRepeatReport(byArm, scenario.id, Math.max(...Object.values(byArm).map((e) => e.length)))
    : formatReport(scores, scenario.id);
  writeFileSync(path.join(resultsDir, "scores.json"), JSON.stringify(scores, null, 2), "utf8");
  writeFileSync(path.join(resultsDir, "report.txt"), report, "utf8");
  console.log(report);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command, ...rest] = process.argv.slice(2);

  process.exitCode =
    command === "doctor"
      ? await doctor()
      : command === "run"
        ? await run(rest)
        : command === "rejudge"
          ? await rejudge(rest)
          : (console.error(
              "usage: node eval/src/run.mjs <doctor|run|rejudge> [--scenario id] [--arms a,b] [--model name] [--claude-model name]"
            ),
            1);
}

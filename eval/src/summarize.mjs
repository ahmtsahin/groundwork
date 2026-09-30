import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { EVAL_ROOT } from "./prepare-arms.mjs";

/**
 * Renders one or more results directories as Markdown: per-arm medians and
 * ranges, which rubric decisions each arm left to a silent assumption, which
 * forbidden questions it asked, and which acceptance statements its final work
 * satisfied. Reads scores the harness already wrote; makes no model calls.
 */

function median(values) {
  const usable = values.filter((value) => typeof value === "number" && Number.isFinite(value));

  if (usable.length === 0) return null;

  const sorted = [...usable].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(3))
    : sorted[middle];
}

function compact(value) {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}k`;
  return String(Number(value.toFixed(2)));
}

function cell(values) {
  const mid = median(values);

  if (mid === null) return "—";

  const usable = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  const low = Math.min(...usable);
  const high = Math.max(...usable);

  return low === high ? compact(mid) : `${compact(mid)} (${compact(low)}–${compact(high)})`;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

/** Compare runs carry a manifest; plain runs are read from scores.json. */
function loadResults(directory) {
  const manifestPath = path.join(directory, "manifest.json");

  if (existsSync(manifestPath)) {
    const manifest = readJson(manifestPath);
    const arms = manifest.arms.map((arm) => {
      const root = path.join(directory, arm.id);
      const runs = existsSync(root)
        ? readdirSync(root)
            .filter((name) => /^run-\d+$/.test(name))
            .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)))
            .map((name) => path.join(root, name, "score.json"))
            .filter((file) => existsSync(file))
            .map(readJson)
        : [];

      return { ...arm, runs };
    });

    return { directory, manifest, arms };
  }

  const scores = readJson(path.join(directory, "scores.json"));
  const scenario = /^(.*?)-\d{4}-\d{2}-\d{2}/.exec(path.basename(directory))?.[1];

  if (!scenario) {
    throw new Error(`cannot infer the scenario from ${directory}; expected <scenario>-<date>`);
  }

  const byArm = new Map();

  for (const score of scores) {
    if (!byArm.has(score.arm)) {
      byArm.set(score.arm, { id: score.arm, label: score.label, channel: score.channel, runs: [] });
    }
    byArm.get(score.arm).runs.push(score);
  }

  return { directory, manifest: { scenario }, arms: [...byArm.values()] };
}

const METRICS = [
  ["Decision questions asked", (s) => s.interaction.decisionQuestions],
  ["Human inputs (forms answered + chat replies)", (s) => s.interaction.humanInputs],
  ["Questions citing repository evidence", (s) => s.questionQuality.evidenceRate],
  ["Single-axis questions", (s) => s.questionQuality.axisPurityRate],
  ["Recommendation accepted", (s) => s.questionQuality.recommendationAccuracy],
  ["Core decisions settled", (s) => s.coverage.coreRate],
  ["Depth decisions settled", (s) => s.coverage.depthRate],
  ["All decisions settled (closure)", (s) => s.coverage.closureRate],
  ["Decisions silently assumed", (s) => s.coverage.missed.length],
  ["Settled from the repository, no question", (s) => s.coverage.resolvedFromRepository.length],
  ["Questions the repository already answered", (s) => s.coverage.forbiddenCount],
  ["Settled decisions kept in the code", (s) => s.outcome.survivalRate],
  ["Path declared correctly", (s) => (s.process?.pathCorrect == null ? null : s.process.pathCorrect ? 1 : 0)],
  ["Tokens (thread total, cached input included)", (s) => s.cost.tokens?.total ?? null],
  ["Seconds", (s) => Math.round(s.cost.wallClockMs / 1000)]
];

function table(header, rows) {
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map((_, index) => (index === 0 ? "---" : "---:")).join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`)
  ].join("\n");
}

function count(arm, predicate) {
  return `${arm.runs.filter(predicate).length}/${arm.runs.length}`;
}

function section({ manifest, arms }) {
  const rubric = readJson(path.join(EVAL_ROOT, "scenarios", manifest.scenario, "rubric.json"));
  const measured = arms.filter((arm) => arm.runs.length > 0);
  const labels = measured.map((arm) => arm.label);
  const lines = [`## ${manifest.scenario}`, ""];

  if (manifest.model) {
    lines.push(
      `Model \`${manifest.model}\` for the agent, the simulated user, and the judge; ${manifest.codexCli ?? "Codex CLI version not recorded"}.`
    );
  }

  lines.push(
    `Median (range) over ${measured.map((arm) => `${arm.runs.length} ${arm.id}`).join(", ")} runs.`,
    "",
    table(
      ["Metric", ...labels],
      METRICS.map(([name, read]) => [name, ...measured.map((arm) => cell(arm.runs.map(read)))])
    ),
    "",
    "Runs in which each material decision was silently assumed:",
    "",
    table(
      ["Decision (tier)", ...labels],
      rubric.materialDecisions.map((decision) => [
        `${decision.id} (${decision.tier ?? "core"})`,
        ...measured.map((arm) => count(arm, (run) => run.coverage.missed.includes(decision.id)))
      ])
    ),
    ""
  );

  const forbidden = rubric.forbiddenQuestions
    .map((question) => [
      question.id,
      ...measured.map((arm) => count(arm, (run) => run.coverage.forbiddenAsked.includes(question.id)))
    ])
    .filter((row) => row.slice(1).some((value) => !value.startsWith("0/")));

  if (forbidden.length > 0) {
    lines.push("Runs that asked a question the repository already answers:", "", table(["Forbidden question", ...labels], forbidden));
  } else {
    lines.push("No arm asked a question the repository already answers.");
  }

  const acceptance = [
    ...rubric.acceptance.mustAchieve.map((text) => ["must achieve", text, "mustAchieveMet"]),
    ...rubric.acceptance.mustPreserve.map((text) => ["must preserve", text, "mustPreserveKept"])
  ];

  lines.push(
    "",
    "Runs whose final work satisfied each acceptance statement, as the judge read the diff:",
    "",
    table(
      ["Acceptance", ...labels],
      acceptance.map(([kind, text, key]) => [
        `${kind}: ${text}`,
        ...measured.map((arm) => count(arm, (run) => (run.outcome[key] ?? []).includes(text)))
      ])
    )
  );

  const aborted = measured.flatMap((arm) =>
    arm.runs
      .map((run, index) => ({ run, index }))
      .filter(({ run }) => run.aborted)
      .map(({ run, index }) => `- ${arm.label}, run ${index}: ${run.aborted}`)
  );

  if (aborted.length > 0) {
    lines.push("", "Runs the agent did not finish, kept in the figures above:", "", ...aborted);
  }

  return lines.join("\n");
}

export function summarize(directories) {
  const loaded = directories.map((directory) => loadResults(path.resolve(directory)));
  const first = loaded[0].manifest;
  const header = ["# Comparison results", ""];

  if (first.harnessCommit) {
    header.push(`Harness commit \`${first.harnessCommit.slice(0, 7)}\`. Schedule: ${first.schedule}.`, "");
  }

  if (first.arms) {
    header.push(
      "Instruction sources:",
      "",
      ...first.arms.map(
        (arm) =>
          `- **${arm.label}** (${arm.channel} channel, ${arm.chars} chars): ${arm.version || arm.origins.join(", ") || "the task alone, no instructions"}`
      )
    );
  }

  return [...header, ...loaded.flatMap((entry) => ["", section(entry)])].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const directories = process.argv.slice(2);

  if (directories.length === 0) {
    console.error("usage: node eval/src/summarize.mjs <results-dir> [<results-dir> ...]");
    process.exitCode = 1;
  } else {
    console.log(summarize(directories));
  }
}

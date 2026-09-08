import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

// @ts-expect-error The eval harness is runtime JavaScript by design.
import { runPreparedArms } from "../eval/src/run.mjs";
// @ts-expect-error The eval harness is runtime JavaScript by design.
import { scoreRun } from "../eval/src/score.mjs";
// @ts-expect-error The eval harness is runtime JavaScript by design.
import { describeDiff, diffWorkspace, snapshotWorkspace } from "../eval/src/workspace.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function temporaryDirectory(t: TestContext): Promise<string> {
  const temporaryRoot = await realpath(os.tmpdir());
  const directory = await mkdtemp(path.join(temporaryRoot, "groundwork-eval-test-"));

  t.after(async () => {
    const resolved = await realpath(directory);
    assert.equal(path.dirname(resolved), temporaryRoot);
    assert.ok(path.basename(resolved).startsWith("groundwork-eval-test-"));
    await rm(resolved, { recursive: true, force: true });
  });

  return directory;
}

interface TestArm {
  id: string;
  label: string;
  channel: string;
}

function completedScore(arm: TestArm, aborted: string | null) {
  return scoreRun({
    arm,
    run: { aborted, wallClockMs: 1000, turns: [], userReplies: [] },
    nativeRounds: [],
    instructionChars: 0,
    rubric: { materialDecisions: [] },
    judge: {
      rubricMaterialCount: 0,
      decisions: [],
      forbiddenAsked: [],
      questionQuality: {
        totalQuestions: 0,
        approvalGates: 0,
        withConcreteOptions: 0,
        withRecommendation: 0,
        withRepositoryEvidence: 0,
        withSingleAxis: 0,
        recommendationAccepted: 0
      },
      outcome: {
        decisionsHonored: [],
        decisionsLost: [],
        mustPreserveKept: [],
        mustAchieveMet: []
      },
      notes: ""
    }
  });
}

const runCases: Array<{
  name: string;
  outcomes: Array<Error | string | null>;
  exitCode: number;
}> = [
  {
    name: "completed eval runs exit successfully and save their results",
    outcomes: [null, null, null],
    exitCode: 0
  },
  {
    name: "eval exits unsuccessfully when every run throws and saves an empty result set",
    outcomes: [new Error("runner failed"), new Error("judge failed"), new Error("runner failed")],
    exitCode: 1
  },
  {
    name: "eval continues after a failed run and preserves the successful partial results",
    outcomes: [null, new Error("judge failed"), null],
    exitCode: 1
  },
  {
    name: "an aborted eval run makes the command fail even when a score was produced",
    outcomes: [null, "turn timed out", null],
    exitCode: 1
  }
];

for (const { name, outcomes, exitCode: expectedExitCode } of runCases) {
  test(name, async (t) => {
    const resultsDir = await temporaryDirectory(t);
    t.mock.method(console, "log", () => {});
    t.mock.method(console, "error", () => {});
    const attempted: number[] = [];

    const exitCode = await runPreparedArms({
      arms: [{ id: "fixture-arm", label: "Fixture", channel: "text" }],
      scenario: { id: "fixture-scenario" },
      options: { repeats: outcomes.length },
      config: { defaultModel: "test-only" },
      resultsDir,
      runOne: async ({ arm, runIndex }: { arm: TestArm; runIndex: number }) => {
        attempted.push(runIndex);
        const outcome = outcomes[runIndex];
        if (outcome instanceof Error) throw outcome;
        return completedScore(arm, outcome);
      }
    });

    assert.equal(exitCode, expectedExitCode);
    assert.deepEqual(attempted, outcomes.map((_, index) => index));
    const saved = JSON.parse(await readFile(path.join(resultsDir, "scores.json"), "utf8"));
    assert.deepEqual(
      saved.map((score: { aborted: string | null }) => score.aborted),
      outcomes.filter((outcome) => !(outcome instanceof Error))
    );
    assert.match(await readFile(path.join(resultsDir, "report.txt"), "utf8"), /fixture-scenario/);
  });
}

test("the eval CLI still handles direct invocation after making its runner importable", () => {
  const result = spawnSync(process.execPath, [path.join(repositoryRoot, "eval/src/run.mjs")], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000
  });

  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage: node eval\/src\/run\.mjs/);
});

test("workspace snapshots detect same-size edits beyond the text capture limit", async (t) => {
  const directory = await temporaryDirectory(t);
  const filename = path.join(directory, "large.js");
  const bytes = Buffer.alloc(20_001, "a");
  await writeFile(filename, bytes);
  const before = snapshotWorkspace(directory);

  assert.deepEqual(diffWorkspace(before, snapshotWorkspace(directory)), {
    added: [], modified: [], removed: []
  });

  bytes[bytes.length - 1] = "b".charCodeAt(0);
  await writeFile(filename, bytes);
  const after = snapshotWorkspace(directory);
  const diff = diffWorkspace(before, after);

  assert.equal(after.get("large.js").size, before.get("large.js").size);
  assert.deepEqual(diff, {
    added: [],
    modified: [{ file: "large.js", before: null, after: null }],
    removed: []
  });
  assert.match(describeDiff(diff), /MODIFIED large\.js/);
});

test("workspace hashes distinguish different bytes with identical UTF-8 replacement text", async (t) => {
  const directory = await temporaryDirectory(t);
  const filename = path.join(directory, "binary.dat");
  const original = Buffer.from([0x80]);
  const changed = Buffer.from([0x81]);
  assert.equal(original.toString("utf8"), changed.toString("utf8"));
  await writeFile(filename, original);
  const before = snapshotWorkspace(directory);
  await writeFile(filename, changed);

  const diff = diffWorkspace(before, snapshotWorkspace(directory));
  assert.equal(diff.modified.length, 1);
  assert.equal(diff.modified[0].file, "binary.dat");
});

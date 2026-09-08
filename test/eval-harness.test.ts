import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// @ts-expect-error The build helper is runtime JavaScript by design.
import { listSections, replaceSection } from "../scripts/lib/skill-sections.mjs";
// @ts-expect-error The eval harness is runtime JavaScript by design.
import { askUserQuestionAnswers, nativeQuestionsFromAskUserQuestion, usageFromClaudeResult } from "../eval/src/claude-runner.mjs";
// @ts-expect-error The eval harness is runtime JavaScript by design.
import { initialPrompt, subtractUsage, usageFromTokenUsage } from "../eval/src/codex-runner.mjs";
// @ts-expect-error The eval harness is runtime JavaScript by design.
import { prepareArms } from "../eval/src/prepare-arms.mjs";
// @ts-expect-error The eval harness is runtime JavaScript by design.
import { formatReport, scoreRun } from "../eval/src/score.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "..");
const sharedSkillFile = path.join(
  repositoryRoot,
  "plugins",
  "groundwork",
  "skills",
  "settle",
  "SKILL.md"
);
const WRAPPER_END = "=== SKILL ===";
const HOST_SECTION = "## Native question tool";

interface Section {
  heading: string;
  text: string;
}

test("replaceSection swaps exactly one level-two section", () => {
  const doc = "# T\n\nintro\n\n## A\n\na body\n\n## B\n\nb body\n\n## C\n\nc body\n";

  const out = replaceSection(doc, "## B", "## B\n\nnew b\n");

  assert.equal(out, "# T\n\nintro\n\n## A\n\na body\n\n## B\n\nnew b\n\n## C\n\nc body\n");
  assert.deepEqual(
    (listSections(out) as Section[]).map((section) => section.heading),
    ["## A", "## B", "## C"]
  );
  assert.throws(() => replaceSection(doc, "## Z", "## Z\n\nx"), /no "## Z" section/);
  assert.throws(() => replaceSection(doc, "## B", "## Q\n\nx"), /must start with "## B"/);
});

test("native token usage reads the thread total, not the last request", () => {
  const params = {
    threadId: "t",
    tokenUsage: {
      total: {
        totalTokens: 248992,
        inputTokens: 241775,
        cachedInputTokens: 217472,
        outputTokens: 7217,
        reasoningOutputTokens: 1512
      },
      last: { totalTokens: 26500, inputTokens: 26289, outputTokens: 211 }
    }
  };

  assert.deepEqual(usageFromTokenUsage(params), {
    input_tokens: 241775,
    output_tokens: 7217,
    total_tokens: 248992,
    cached_input_tokens: 217472,
    reasoning_output_tokens: 1512
  });
  assert.equal(usageFromTokenUsage({ threadId: "t" }), null);
  assert.deepEqual(
    subtractUsage({ total_tokens: 300, input_tokens: 280 }, { total_tokens: 100, input_tokens: 90 }),
    { total_tokens: 200, input_tokens: 190 }
  );
  assert.deepEqual(subtractUsage({ total_tokens: 5 }, null), { total_tokens: 5 });
});

test("Claude Code questions get stable ids and answers map back to question text", () => {
  const input = {
    questions: [
      {
        question: "Which side carries the flag?",
        header: "Flag",
        options: [
          { label: "Ad hoc (Recommended)", description: "a" },
          { label: "Batch", description: "b" }
        ],
        multiSelect: false
      },
      { question: "Bound?", header: "Bound", options: [{ label: "5 min" }] }
    ]
  };

  const questions = nativeQuestionsFromAskUserQuestion(input, 2);
  assert.deepEqual(
    questions.map((question: { id: string }) => question.id),
    ["r2-q1", "r2-q2"]
  );
  assert.equal(questions[1].options[0].description, "");
  assert.equal(questions[1].multiSelect, false);

  assert.deepEqual(
    askUserQuestionAnswers(questions, [
      { questionId: "r2-q2", answer: "15 minutes" },
      { questionId: "r2-q1", answer: "Batch" }
    ]),
    { "Which side carries the flag?": "Batch", "Bound?": "15 minutes" }
  );
});

test("Claude Code usage counts every input token and derives the per-turn cost", () => {
  const result = {
    total_cost_usd: 1.5,
    usage: {
      input_tokens: 10,
      cache_creation_input_tokens: 3932,
      cache_read_input_tokens: 29800,
      output_tokens: 68
    }
  };

  assert.deepEqual(usageFromClaudeResult(result, 0.5), {
    input_tokens: 33742,
    output_tokens: 68,
    total_tokens: 33810,
    cached_input_tokens: 29800,
    cost_usd: 1
  });
  assert.equal(usageFromClaudeResult({}), null);
});

test("process scoring reads the declared path and approach counts, and tolerates their absence", () => {
  const rubric = {
    expectedPath: "architectural",
    materialDecisions: [{ id: "a", tier: "core" }, { id: "b", tier: "depth" }]
  };
  const judgeBase = {
    decisions: [
      { id: "a", disposition: "asked", justification: "" },
      { id: "b", disposition: "missed", justification: "" }
    ],
    forbiddenAsked: [],
    questionQuality: {
      totalQuestions: 3,
      approvalGates: 1,
      withSingleAxis: 2,
      recommendationAccepted: 1,
      withConcreteOptions: 2,
      withRecommendation: 2,
      withRepositoryEvidence: 2
    },
    outcome: { decisionsHonored: ["a"], decisionsLost: [], mustPreserveKept: [], mustAchieveMet: [] },
    notes: "",
    rubricMaterialCount: 2
  };
  const run = { aborted: null, wallClockMs: 1000, turns: [], userReplies: [] };
  const arm = { id: "x", label: "x", channel: "native" };

  const withProcess = scoreRun({
    arm,
    run,
    nativeRounds: [{}, {}],
    judge: {
      ...judgeBase,
      process: {
        pathStated: "architectural",
        approachesPresented: 3,
        distinctApproaches: 2,
        fakeAlternatives: 1,
        approachDecisionAsked: true,
        approachBeforeDetails: true
      }
    },
    instructionChars: 0,
    rubric
  });
  assert.equal(withProcess.process.pathCorrect, true);
  assert.equal(withProcess.process.distinctApproaches, 2);
  assert.equal(withProcess.interaction.humanInputs, 2);
  const reported: string = formatReport([withProcess], "s");
  assert.match(reported, /arch\+/);
  assert.match(reported, /2\/3/);

  const withoutProcess = scoreRun({
    arm,
    run,
    nativeRounds: [],
    judge: judgeBase,
    instructionChars: 0,
    rubric: { ...rubric, expectedPath: "bounded" }
  });
  assert.equal(withoutProcess.process.pathStated, null);
  assert.equal(withoutProcess.process.pathCorrect, null);
  assert.doesNotThrow(() => formatReport([withoutProcess], "s"));
});

test("Windows runs use the unelevated sandbox so unattended runs never wait on a UAC prompt", async () => {
  for (const file of ["eval/src/codex-runner.mjs", "eval/src/app-server-client.mjs"]) {
    const source = await readFile(path.join(repositoryRoot, file), "utf8");
    assert.match(source, /windows\.sandbox="unelevated"/, file);
    assert.doesNotMatch(source, /windows\.sandbox="elevated"/, file);
  }
});

test("the first prompt carries the task alone when an arm has no instructions", () => {
  assert.equal(initialPrompt("", "Fix it."), "Fix it.");
  assert.equal(initialPrompt("SKILL", "Fix it."), "SKILL\n\n=== TASK ===\nFix it.");
});

test("the no-skill control and the text variant resolve from the shared skill", async () => {
  const { arms } = await prepareArms({ only: ["no-skill", "settle-text"] });
  const noSkill = arms.find((arm: { id: string }) => arm.id === "no-skill");
  const textArm = arms.find((arm: { id: string }) => arm.id === "settle-text");

  assert.ok(noSkill?.ok, "no-skill arm must resolve");
  assert.equal(noSkill.channel, "text");
  assert.equal(noSkill.instructions, "");
  assert.equal(noSkill.chars, 0);

  assert.ok(textArm?.ok, textArm?.detail);
  assert.equal(textArm.channel, "text");
  assert.equal(textArm.enableFeatures, undefined);
  assert.ok(textArm.instructions.startsWith("The following skill is active"));

  const derived: string = textArm.instructions
    .slice(textArm.instructions.indexOf(WRAPPER_END) + WRAPPER_END.length)
    .trim();
  assert.doesNotMatch(derived, /request_user_input|AskUserQuestion/);

  const shared = await readFile(sharedSkillFile, "utf8");
  const sharedSections = listSections(shared) as Section[];
  const derivedSections = listSections(derived) as Section[];

  assert.deepEqual(
    derivedSections.map((section) => section.heading),
    sharedSections.map((section) => section.heading)
  );

  sharedSections.forEach((section, index) => {
    if (section.heading === HOST_SECTION) {
      assert.notEqual(derivedSections[index].text, section.text);
      assert.match(derivedSections[index].text, /no native question form/);
    } else {
      assert.equal(derivedSections[index].text, section.text, section.heading);
    }
  });
});

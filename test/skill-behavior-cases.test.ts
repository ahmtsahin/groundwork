import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

interface RepositoryFact {
  source: string;
  statement: string;
}

interface DecisionNode {
  id: string;
  dependsOn: string[];
}

interface ExpectedBehavior {
  entryMode: "root-decision" | "frontier" | "orientation-fallback";
  firstRoundTargets: string[];
  contextRequires: string[];
  deferred: string[];
  forbiddenQuestionTargets: string[];
}

interface BehaviorCase {
  id: string;
  request: string;
  repositoryFacts: RepositoryFact[];
  decisions: DecisionNode[];
  expected: ExpectedBehavior;
}

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

async function loadCases(): Promise<BehaviorCase[]> {
  const raw = await readFile(
    path.join(testDirectory, "fixtures/bare-invocation-behavior-cases.json"),
    "utf8"
  );
  const payload = JSON.parse(raw) as { version: number; cases: BehaviorCase[] };
  assert.equal(payload.version, 1);
  return payload.cases;
}

test("behavior cases distinguish strict-root intake from an independent first frontier", async () => {
  const cases = await loadCases();
  const ids = new Set(cases.map((scenario) => scenario.id));

  assert.equal(ids.size, cases.length);
  assert.deepEqual(ids, new Set([
    "evidence-backed-root-decision",
    "honest-orientation-fallback",
    "dependent-document-language",
    "independent-product-axes"
  ]));

  for (const scenario of cases) {
    assert.ok(scenario.repositoryFacts.length >= 2);
    assert.ok(scenario.repositoryFacts.every((fact) => fact.source && fact.statement));

    const decisionIds = new Set(scenario.decisions.map((decision) => decision.id));
    assert.equal(decisionIds.size, scenario.decisions.length);
    for (const decision of scenario.decisions) {
      assert.ok(decision.dependsOn.every((dependency) => decisionIds.has(dependency)));
    }
    assert.ok(
      scenario.expected.deferred.every((decision) => decisionIds.has(decision))
    );

    const rootIds = scenario.decisions
      .filter((decision) => decision.dependsOn.length === 0)
      .map((decision) => decision.id);

    if (scenario.expected.entryMode === "orientation-fallback") {
      assert.equal(rootIds.length, 0);
    } else if (scenario.expected.entryMode === "root-decision") {
      assert.equal(rootIds.length, 1);
      assert.deepEqual(scenario.expected.firstRoundTargets, rootIds);
    } else {
      assert.ok(rootIds.length > 1);
      assert.deepEqual(scenario.expected.firstRoundTargets, rootIds);
    }
  }

  const rootCase = cases.find((scenario) => scenario.id === "evidence-backed-root-decision")!;
  assert.equal(rootCase.expected.entryMode, "root-decision");
  assert.deepEqual(rootCase.expected.firstRoundTargets, ["root-premise"]);
  assert.ok(rootCase.expected.contextRequires.includes("source-anchors"));
  assert.ok(rootCase.expected.contextRequires.includes("labelled-inference-or-open-tension"));
  for (const deferred of rootCase.expected.deferred) {
    assert.ok(
      rootCase.decisions
        .find((decision) => decision.id === deferred)!
        .dependsOn.includes("root-premise")
    );
  }

  const fallbackCase = cases.find((scenario) => scenario.id === "honest-orientation-fallback")!;
  assert.equal(fallbackCase.decisions.length, 0);
  assert.equal(fallbackCase.expected.entryMode, "orientation-fallback");
  assert.deepEqual(fallbackCase.expected.firstRoundTargets, ["observable-outcome-fork"]);
  assert.ok(fallbackCase.expected.forbiddenQuestionTargets.includes("repository-layer-menu"));

  const dependencyCase = cases.find((scenario) => scenario.id === "dependent-document-language")!;
  assert.deepEqual(dependencyCase.expected.firstRoundTargets, ["session-artifact"]);
  assert.ok(dependencyCase.expected.deferred.includes("document-language"));
  assert.deepEqual(
    dependencyCase.decisions.find((decision) => decision.id === "document-language")!.dependsOn,
    ["session-artifact"]
  );

  const frontierCase = cases.find((scenario) => scenario.id === "independent-product-axes")!;
  assert.equal(frontierCase.expected.entryMode, "frontier");
  assert.deepEqual(frontierCase.expected.firstRoundTargets, [
    "next-iteration-success",
    "strategy-composition",
    "target-user"
  ]);
  assert.ok(frontierCase.expected.forbiddenQuestionTargets.includes("single-question-intake"));
  assert.ok(frontierCase.expected.forbiddenQuestionTargets.includes("release-priority-bundle"));
  assert.ok(frontierCase.expected.contextRequires.includes("counterfactual-dependency-audit"));

  for (const target of frontierCase.expected.firstRoundTargets) {
    assert.deepEqual(
      frontierCase.decisions.find((decision) => decision.id === target)!.dependsOn,
      [],
      `${target} must remain a root-level decision in the first frontier`
    );
  }

  assert.deepEqual(
    frontierCase.decisions.find((decision) => decision.id === "packaging-scope")!.dependsOn,
    ["target-user"]
  );
});

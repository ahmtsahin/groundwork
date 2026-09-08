function ratio(part, whole) {
  if (!(whole > 0)) {
    return null;
  }

  // A share above 1 means the judge counted a numerator over a wider set than
  // the denominator. Clamp so a miscount cannot masquerade as a strong score;
  // the raw counts stay in scores.json for diagnosis.
  return Number((Math.min(part / whole, 1)).toFixed(3));
}

function sumTokens(turns) {
  let input = 0;
  let output = 0;
  let total = 0;
  let seen = false;

  for (const turn of turns) {
    const usage = turn.usage;

    if (!usage) {
      continue;
    }

    seen = true;
    input += Number(usage.input_tokens ?? 0);
    output += Number(usage.output_tokens ?? 0);
    total += Number(usage.total_tokens ?? 0);
  }

  if (!seen) {
    return null;
  }

  return {
    input,
    output,
    total: total > 0 ? total : input + output
  };
}

function withDisposition(judge, disposition) {
  return (judge.decisions ?? [])
    .filter((entry) => entry.disposition === disposition)
    .map((entry) => entry.id);
}

export function scoreRun({ arm, run, nativeRounds, judge, instructionChars, rubric }) {
  const quality = judge.questionQuality;
  const materialCount = judge.rubricMaterialCount ?? null;

  // Approval gates inflate raw question counts and score as trivially
  // single-axis, so quality rates are read over real decisions only.
  const gates = quality.approvalGates ?? 0;
  const decisionQuestions = Math.max(quality.totalQuestions - gates, 0);

  const tierOf = new Map(
    (rubric?.materialDecisions ?? []).map((entry) => [entry.id, entry.tier ?? "core"])
  );
  const settled = new Set([
    ...withDisposition(judge, "asked"),
    ...withDisposition(judge, "resolved_from_repository"),
    ...withDisposition(judge, "user_volunteered")
  ]);
  const tierTotals = { core: 0, depth: 0 };
  const tierSettled = { core: 0, depth: 0 };

  for (const [id, tier] of tierOf) {
    tierTotals[tier] = (tierTotals[tier] ?? 0) + 1;
    if (settled.has(id)) {
      tierSettled[tier] = (tierSettled[tier] ?? 0) + 1;
    }
  }

  const honored = judge.outcome.decisionsHonored.length;
  const lost = judge.outcome.decisionsLost.length;

  // Process fields arrived with rubric version 3; judge output recorded
  // before then has none, and the report prints those cells as unmeasured.
  const process = judge.process ?? null;
  const pathExpected = rubric?.expectedPath ?? null;

  return {
    arm: arm.id,
    label: arm.label,
    channel: arm.channel,
    aborted: run.aborted,

    cost: {
      instructionChars,
      wallClockMs: run.wallClockMs,
      tokens: sumTokens(run.turns)
    },

    interaction: {
      agentTurns: run.turns.length,
      userMessages: run.userReplies.length,
      nativeRounds: nativeRounds.length,
      // Every keyboard interaction, whichever channel carried it: a chat reply
      // on the text channel, an answered form on the native one. This is the
      // number to compare across channels; userMessages alone flatters native.
      humanInputs: run.userReplies.length + nativeRounds.length,
      questionsAsked: quality.totalQuestions,
      approvalGates: gates,
      decisionQuestions
    },

    questionQuality: {
      withConcreteOptions: quality.withConcreteOptions,
      withRecommendation: quality.withRecommendation,
      withRepositoryEvidence: quality.withRepositoryEvidence,
      withSingleAxis: quality.withSingleAxis,
      recommendationAccepted: quality.recommendationAccepted,
      optionRate: ratio(quality.withConcreteOptions, decisionQuestions),
      recommendationRate: ratio(quality.withRecommendation, decisionQuestions),
      evidenceRate: ratio(quality.withRepositoryEvidence, decisionQuestions),
      // A question whose options bundle several decisions denies the user every
      // combination that was not packaged.
      axisPurityRate: ratio(quality.withSingleAxis, decisionQuestions),
      // How often the recommendation was the answer the user actually wanted.
      recommendationAccuracy: ratio(
        quality.recommendationAccepted,
        quality.withRecommendation
      )
    },

    coverage: {
      materialCount,
      coreSettled: tierSettled.core,
      coreTotal: tierTotals.core,
      coreRate: ratio(tierSettled.core, tierTotals.core),
      depthSettled: tierSettled.depth,
      depthTotal: tierTotals.depth,
      depthRate: ratio(tierSettled.depth, tierTotals.depth),
      asked: withDisposition(judge, "asked"),
      resolvedFromRepository: withDisposition(judge, "resolved_from_repository"),
      userVolunteered: withDisposition(judge, "user_volunteered"),
      missed: withDisposition(judge, "missed"),
      // Nothing left silently assumed, however it got settled.
      closureRate: ratio(
        (materialCount ?? 0) - withDisposition(judge, "missed").length,
        materialCount ?? 0
      ),
      forbiddenAsked: judge.forbiddenAsked,
      forbiddenCount: judge.forbiddenAsked.length
    },

    outcome: {
      decisionsHonored: honored,
      decisionsLost: lost,
      survivalRate: ratio(honored, honored + lost),
      mustPreserveKept: judge.outcome.mustPreserveKept,
      mustAchieveMet: judge.outcome.mustAchieveMet
    },

    process: {
      pathStated: process?.pathStated ?? null,
      pathExpected,
      // Sizing is right when the declared path matches the rubric's; a session
      // that declares nothing is wrong on every scenario that expects a path.
      pathCorrect:
        process && pathExpected ? process.pathStated === pathExpected : null,
      approachesPresented: process?.approachesPresented ?? null,
      distinctApproaches: process?.distinctApproaches ?? null,
      fakeAlternatives: process?.fakeAlternatives ?? null,
      approachDecisionAsked: process?.approachDecisionAsked ?? null,
      approachBeforeDetails: process?.approachBeforeDetails ?? null
    },

    notes: judge.notes
  };
}

function median(values) {
  const usable = values.filter((value) => typeof value === "number");

  if (usable.length === 0) {
    return null;
  }

  const sorted = [...usable].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(3))
    : sorted[middle];
}

function spread(values) {
  const usable = values.filter((value) => typeof value === "number");

  if (usable.length === 0) {
    return "—";
  }

  const low = Math.min(...usable);
  const high = Math.max(...usable);

  return low === high ? String(low) : `${low}–${high}`;
}

/**
 * Repeat runs are reported as median plus observed range. A metric whose range
 * spans most of its scale has not been measured, however good the median looks.
 */
export function formatRepeatReport(byArm, scenarioId, repeats) {
  const metrics = [
    ["decisionQs", (s) => s.interaction.decisionQuestions],
    ["approvalGates", (s) => s.interaction.approvalGates],
    ["axisPurity", (s) => s.questionQuality.axisPurityRate],
    ["evidence", (s) => s.questionQuality.evidenceRate],
    ["recAccuracy", (s) => s.questionQuality.recommendationAccuracy],
    ["coreCovered", (s) => s.coverage.coreRate],
    ["depthCovered", (s) => s.coverage.depthRate],
    ["closed", (s) => s.coverage.closureRate],
    ["missed", (s) => s.coverage.missed.length],
    ["fromRepo", (s) => s.coverage.resolvedFromRepository.length],
    ["forbidden", (s) => s.coverage.forbiddenCount],
    ["survival", (s) => s.outcome.survivalRate],
    ["userMessages", (s) => s.interaction.userMessages],
    ["humanInputs", (s) => s.interaction.humanInputs ?? null],
    ["pathCorrect", (s) => (s.process?.pathCorrect == null ? null : s.process.pathCorrect ? 1 : 0)],
    ["approaches", (s) => s.process?.distinctApproaches ?? null],
    ["fakeApproach", (s) => s.process?.fakeAlternatives ?? null],
    ["tokens", (s) => s.cost.tokens?.total ?? null],
    ["seconds", (s) => Math.round(s.cost.wallClockMs / 1000)]
  ];

  const lines = [`Scenario: ${scenarioId}   repeats: ${repeats}`, ""];

  for (const [armId, scores] of Object.entries(byArm)) {
    lines.push(`${scores[0]?.label ?? armId}  (${scores.length} run(s))`);
    lines.push(`  ${"metric".padEnd(14)}${"median".padEnd(10)}range`);

    for (const [name, read] of metrics) {
      const values = scores.map(read);
      lines.push(
        `  ${name.padEnd(14)}${String(median(values) ?? "—").padEnd(10)}${spread(values)}`
      );
    }

    lines.push("");
  }

  return lines.join("\n");
}

function cell(value, width) {
  const text = value === null || value === undefined ? "—" : String(value);
  return text.padEnd(width);
}

const PATH_ABBREVIATION = { spike: "spk", bounded: "bnd", architectural: "arch", none: "none" };

/** "arch+" when the declared path matches the rubric, "bnd-" when it does not. */
function pathCell(process) {
  if (!process || process.pathStated === null) {
    return null;
  }

  const mark = process.pathCorrect === null ? "" : process.pathCorrect ? "+" : "-";
  return `${PATH_ABBREVIATION[process.pathStated] ?? process.pathStated}${mark}`;
}

/** "2/3": distinct approaches over approaches presented. */
function approachCell(process) {
  if (!process || process.approachesPresented === null) {
    return null;
  }

  return `${process.distinctApproaches}/${process.approachesPresented}`;
}

export function formatReport(scores, scenarioId) {
  const rows = [
    ["arm", 30],
    ["turns", 6],
    ["user msgs", 10],
    ["human", 7],
    ["questions", 10],
    ["path", 7],
    ["appr", 6],
    ["evid", 6],
    ["axis", 6],
    ["recAcc", 8],
    ["closed", 7],
    ["missed", 7],
    ["fromRepo", 9],
    ["forbid", 7],
    ["surv", 6],
    ["tokens", 9],
    ["sec", 6]
  ];

  const lines = [
    `Scenario: ${scenarioId}`,
    "",
    rows.map(([name, width]) => cell(name, width)).join(""),
    rows.map(([, width]) => "-".repeat(width - 1) + " ").join("")
  ];

  for (const score of scores) {
    lines.push(
      [
        cell(score.label, 30),
        cell(score.interaction.agentTurns, 6),
        cell(score.interaction.userMessages, 10),
        cell(score.interaction.humanInputs ?? null, 7),
        cell(score.interaction.questionsAsked, 10),
        cell(pathCell(score.process), 7),
        cell(approachCell(score.process), 6),
        cell(score.questionQuality.evidenceRate, 6),
        cell(score.questionQuality.axisPurityRate, 6),
        cell(score.questionQuality.recommendationAccuracy, 8),
        cell(score.coverage.closureRate, 7),
        cell(score.coverage.missed.length, 7),
        cell(score.coverage.resolvedFromRepository.length, 9),
        cell(score.coverage.forbiddenCount, 7),
        cell(score.outcome.survivalRate, 6),
        cell(score.cost.tokens?.total ?? null, 9),
        cell(Math.round(score.cost.wallClockMs / 1000), 6)
      ].join("")
    );
  }

  lines.push("");
  lines.push("Legend:");
  lines.push("  user msgs  chat replies a human had to type");
  lines.push("  human      keyboard interactions on any channel: chat replies plus native forms answered");
  lines.push("  path       sizing the agent declared (spk, bnd, arch, none); + matches the rubric, - does not");
  lines.push("  appr       distinct approaches offered over approaches offered; fake alternatives are the gap");
  lines.push("  evid       share of questions citing a specific repository fact");
  lines.push("  axis       share of questions whose options differ on one axis only");
  lines.push("  recAcc     share of recommendations the user actually accepted");
  lines.push("  closed     material decisions left with nothing silently assumed");
  lines.push("  missed     material decisions the agent assumed instead of settling");
  lines.push("  fromRepo   decisions settled from repository evidence, costing the user nothing");
  lines.push("  forbid     questions asked that the repository already answered");
  lines.push("  surv       settled decisions still honored in the final work");

  for (const score of scores) {
    if (score.aborted) {
      lines.push("");
      lines.push(`  ! ${score.label} aborted: ${score.aborted}`);
    }
  }

  return lines.join("\n");
}

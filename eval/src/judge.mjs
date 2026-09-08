import { runStructured } from "./codex-json.mjs";

/**
 * Scores one run against the scenario rubric.
 *
 * The judge only reads what the user could have seen (the questions put to
 * them, their answers, the final report) plus the resulting file changes. It
 * never sees which arm produced the run, so arm identity cannot bias it.
 */

const JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decisions", "forbiddenAsked", "questionQuality", "process", "outcome", "notes"],
  properties: {
    process: {
      type: "object",
      additionalProperties: false,
      required: [
        "pathStated",
        "approachesPresented",
        "distinctApproaches",
        "fakeAlternatives",
        "approachDecisionAsked",
        "approachBeforeDetails"
      ],
      properties: {
        pathStated: {
          type: "string",
          enum: ["spike", "bounded", "architectural", "none"],
          description:
            "The work-sizing the agent declared before its first question: spike, bounded, or architectural. none when it never declared one."
        },
        approachesPresented: {
          type: "integer",
          description:
            "How many whole solution approaches the agent put to the user as alternatives to choose between. The options of a single detail question are not approaches."
        },
        distinctApproaches: {
          type: "integer",
          description:
            "Of approachesPresented, how many differ from every other one in at least two of: seam, observable behavior, compatibility, failure mode, operating cost. Use the rubric's approachFamilies when present."
        },
        fakeAlternatives: {
          type: "integer",
          description:
            "approachesPresented minus distinctApproaches: variants that differ only in a parameter of another approach offered."
        },
        approachDecisionAsked: {
          type: "boolean",
          description: "Whether the user was put a question whose options were whole approaches."
        },
        approachBeforeDetails: {
          type: "boolean",
          description:
            "Whether that approach question came before any detail decision question. False when no approach question was asked."
        }
      }
    },
    decisions: {
      type: "array",
      description: "One entry for every material decision in the rubric, in rubric order.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "disposition", "justification"],
        properties: {
          id: { type: "string" },
          disposition: {
            type: "string",
            enum: ["asked", "resolved_from_repository", "user_volunteered", "missed"],
            description:
              "asked: the user was actually put a question or option about it. resolved_from_repository: the agent settled it from a repository fact and never needed to ask. user_volunteered: the user supplied it unprompted, in a note or free-text answer. missed: it was never settled and the agent proceeded on a silent assumption."
          },
          justification: {
            type: "string",
            description: "One sentence quoting or naming what in the transcript supports this disposition."
          }
        }
      }
    },
    forbiddenAsked: {
      type: "array",
      description: "Ids of rubric forbidden questions the agent nonetheless asked the user.",
      items: { type: "string" }
    },
    questionQuality: {
      type: "object",
      additionalProperties: false,
      required: [
        "totalQuestions",
        "withConcreteOptions",
        "withRecommendation",
        "withRepositoryEvidence",
        "withSingleAxis",
        "recommendationAccepted",
        "approvalGates"
      ],
      properties: {
        totalQuestions: { type: "integer" },
        approvalGates: {
          type: "integer",
          description:
            "Of totalQuestions, how many merely asked the user to confirm or approve work already described, rather than choosing between substantive alternatives. 'Does this architecture look right?' is a gate; 'where should the data live?' is not."
        },
        withSingleAxis: {
          type: "integer",
          description:
            "Of the decision questions (totalQuestions minus approvalGates), how many have options differing on exactly one decision axis. A question whose options are packages varying in several respects at once does not count."
        },
        recommendationAccepted: {
          type: "integer",
          description:
            "Of the decision questions, how many carried a recommendation the user then chose."
        },
        withConcreteOptions: {
          type: "integer",
          description: "Of the decision questions, how many offered at least two concrete, distinguishable options."
        },
        withRecommendation: {
          type: "integer",
          description: "Of the decision questions, how many named exactly one recommended answer."
        },
        withRepositoryEvidence: {
          type: "integer",
          description: "Of the decision questions, how many cite a specific repository fact (path, test, constant, stated constraint)."
        }
      }
    },
    outcome: {
      type: "object",
      additionalProperties: false,
      required: ["decisionsHonored", "decisionsLost", "mustPreserveKept", "mustAchieveMet"],
      properties: {
        decisionsHonored: {
          type: "array",
          description: "Rubric decision ids whose settled answer is visibly reflected in the final work.",
          items: { type: "string" }
        },
        decisionsLost: {
          type: "array",
          description: "Rubric decision ids that were settled with the user but contradicted or ignored in the final work.",
          items: { type: "string" }
        },
        mustPreserveKept: {
          type: "array",
          description: "Acceptance mustPreserve statements the final work still satisfies, quoted from the rubric.",
          items: { type: "string" }
        },
        mustAchieveMet: {
          type: "array",
          description: "Acceptance mustAchieve statements the final work satisfies, quoted from the rubric.",
          items: { type: "string" }
        }
      }
    },
    notes: {
      type: "string",
      description: "Two or three sentences on what this session did well or badly."
    }
  }
};

function renderNativeRounds(rounds) {
  if (rounds.length === 0) {
    return "(no native question form calls)";
  }

  return rounds
    .map((record, index) => {
      const questions = record.questions
        .map((question) => {
          const options = (question.options ?? [])
            .map(
              (option) =>
                `      - ${option.label}: ${option.description}`
            )
            .join("\n");
          const answer = record.answers.find((entry) => entry.questionId === question.id);

          return [
            `    Q ${question.id} (${question.header})`,
            `      question: ${question.question}`,
            options,
            `      ANSWER: ${answer?.answer ?? "(none)"}`
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n");

      return [
        `  Native call ${index + 1}`,
        record.leadIn ? `  context before call: ${record.leadIn}` : null,
        questions
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function renderTextTurns(turns, userReplies) {
  const lines = [];

  turns.forEach((turn, index) => {
    lines.push(`  --- agent turn ${index + 1} ---\n${turn.finalMessage || "(empty)"}`);

    if (userReplies[index]) {
      lines.push(`  --- user reply ${index + 1} ---\n${userReplies[index]}`);
    }
  });

  return lines.length > 0 ? lines.join("\n\n") : "(no turns)";
}

export async function judgeRun({ rubric, run, nativeRounds, diffText, options = {} }) {
  const prompt = [
    "You are scoring one recorded session between a coding agent and a user.",
    "Be strict and literal. Credit only what the transcript actually shows.",
    "",
    "=== RUBRIC ===",
    JSON.stringify(rubric, null, 2),
    "",
    "=== QUESTIONS PUT TO THE USER THROUGH THE NATIVE QUESTION FORM ===",
    renderNativeRounds(nativeRounds),
    "",
    "=== AGENT MESSAGES AND USER REPLIES ===",
    renderTextTurns(run.turns, run.userReplies),
    "",
    "=== RESULTING FILE CHANGES ===",
    diffText,
    "",
    "Scoring rules:",
    "- Emit exactly one `decisions` entry per rubric material decision.",
    "- `asked` requires the user to have been put a question or an option about",
    "  that decision. An agent stating a conclusion is not asking.",
    "- `resolved_from_repository` is the right disposition when the agent settled",
    "  it from a repository fact and never needed the user. This is a success,",
    "  not a gap: prefer it over `asked` whenever the repository proves the answer.",
    "- `user_volunteered` is for anything the user supplied unprompted, typically",
    "  inside a note or an Other answer. Never score that as `asked`.",
    "- `missed` means nobody settled it and the agent proceeded anyway.",
    "- A forbidden question counts as asked only if the user was asked something",
    "  the repository already answers; an agent stating the fact does not count.",
    "- Count every distinct question put to the user, native and prose alike.",
    "- withRepositoryEvidence requires a specific anchor, not a general claim.",
    "- For withSingleAxis, write each option of a question as the tuple of",
    "  properties it fixes. The question counts only if every pair of options",
    "  differs in exactly one position. Options that bundle, say, a policy and",
    "  which side carries a flag and a staleness rule are packages, not axes.",
    "- recommendationAccepted counts only questions where a recommendation was",
    "  made and the user picked that exact option.",
    "- Every other questionQuality count is taken over decision questions only,",
    "  never over approval gates, so none of them may exceed",
    "  totalQuestions minus approvalGates.",
    "- approvalGates counts confirmation checkpoints, not decisions. A question",
    "  whose realistic answers are approve or disapprove of something the agent",
    "  already designed is a gate. Count it in totalQuestions too, but name it",
    "  here so question quality can be read over real decisions alone.",
    "- decisionsHonored requires visible support in the file changes or, when",
    "  there are none, in the final agent message.",
    "- pathStated is the sizing the agent declared (spike, bounded, or",
    "  architectural) before its first question; use none when it declared",
    "  nothing. Do not infer a path from the work itself.",
    "- An approach is a whole solution shape put to the user as an alternative",
    "  to choose between; the options of one detail question are not approaches.",
    "  Count fakeAlternatives strictly: an approach that differs from another",
    "  only in a parameter, a default, or a name is the same approach.",
    "- Never credit an item the transcript does not support.",
    "Reply with JSON only."
  ].join("\n");

  return runStructured(prompt, JUDGE_SCHEMA, { ...options, label: "judge" });
}

import { runStructured } from "./codex-json.mjs";

/**
 * Plays the user. Runs in its own Codex process with `--ignore-user-config` and
 * a temporary Codex home, so none of the operator's configuration, skills, or
 * plugins leak into the simulated user's context: the simulator must never
 * itself run the skill under test.
 */

const NATIVE_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answers"],
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["questionId", "answer"],
        properties: {
          questionId: { type: "string" },
          answer: {
            type: "string",
            description:
              "The exact offered label when one fits, otherwise concise free-form text."
          }
        }
      }
    }
  }
};

const TEXT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["done", "questionCount", "reply"],
  properties: {
    done: {
      type: "boolean",
      description: "True when the agent asked nothing and is reporting results."
    },
    questionCount: {
      type: "integer",
      description: "How many distinct questions the agent put to the user."
    },
    reply: {
      type: "string",
      description: "What the user sends back. Empty when done is true."
    }
  }
};

function personaPreamble(persona) {
  return [
    "You are role-playing a human software user in a usability study.",
    "You are NOT an assistant and you never write code or use tools.",
    "Answer only as this person would, from the brief below.",
    "",
    "=== PERSONA BRIEF ===",
    persona.trim(),
    "=== END BRIEF ===",
    "",
    "Rules:",
    "- Stay consistent with every answer you have already given.",
    "- If the brief does not settle a question, choose what this person would",
    "  plausibly choose and stay consistent afterwards.",
    "- Never invent repository facts. You know your goals, not the codebase.",
    "- Be terse, the way a busy person answering a form is terse.",
    "- Reply with JSON only, matching the required schema."
  ].join("\n");
}

export function normalizeNativeAnswers(questions, answers) {
  return questions.map((question) => {
    const match = answers.find((entry) => entry?.questionId === question.id);
    const answer = typeof match?.answer === "string" ? match.answer.trim() : "";
    const fallback =
      question.options?.[0]?.label ??
      "No strong preference; use your recommendation.";

    return { questionId: question.id, answer: answer || fallback };
  });
}

export function nativeResponseFromAnswers(answers) {
  return {
    answers: Object.fromEntries(
      answers.map((entry) => [
        entry.questionId,
        { answers: [entry.answer] }
      ])
    )
  };
}

/** Answers one native request_user_input call. */
export async function answerNativeQuestions(
  persona,
  { leadIn = "", questions, history = [] },
  options = {}
) {
  const rendered = questions.map((question) => ({
    id: question.id,
    header: question.header,
    question: question.question,
    options: (question.options ?? []).map((option) => ({
      label: option.label,
      description: option.description
    }))
  }));

  const prompt = [
    personaPreamble(persona),
    "",
    "A coding agent asked through its host's native question form. Answer every",
    "question exactly once. Copy the exact offered label when one fits. When no",
    "option fits, write the concise custom answer the person would enter through",
    "the client's free-form Other choice.",
    "",
    history.length > 0
      ? `Answers already given in earlier native calls:\n${JSON.stringify(history, null, 2)}`
      : "No native answers have been given yet.",
    "",
    leadIn ? `AGENT CONTEXT BEFORE THE CALL:\n${leadIn}` : "(no recorded lead-in text)",
    "",
    "NATIVE QUESTIONS:",
    JSON.stringify(rendered, null, 2)
  ].join("\n");

  const result = await runStructured(prompt, NATIVE_INPUT_SCHEMA, {
    ...options,
    label: "sim"
  });
  const answers = Array.isArray(result?.answers) ? result.answers : [];
  return normalizeNativeAnswers(questions, answers);
}

/** Reads a text-channel turn and decides whether the user must reply again. */
export async function answerTextTurn(persona, agentMessage, history, options = {}) {
  const prompt = [
    personaPreamble(persona),
    "",
    "A coding agent sent the message below. Decide what it is:",
    "- If it asks you anything, set done=false, count the distinct questions in",
    "  questionCount, and write the user's reply in `reply`. Answer every",
    "  question it asked, briefly, referencing question numbers when it used them.",
    "- If it is reporting finished work or a final plan and asks nothing, set",
    "  done=true, questionCount=0 and leave reply empty.",
    "- A request to confirm or approve counts as a question.",
    "",
    history.length > 0
      ? `Answers you already gave, in order:\n${history.map((entry, index) => `${index + 1}. ${entry}`).join("\n")}`
      : "You have not answered anything yet.",
    "",
    "AGENT MESSAGE:",
    agentMessage
  ].join("\n");

  const result = await runStructured(prompt, TEXT_SCHEMA, { ...options, label: "sim" });

  return {
    done: result?.done === true,
    questionCount: Number.isInteger(result?.questionCount) ? result.questionCount : 0,
    reply: typeof result?.reply === "string" ? result.reply : ""
  };
}

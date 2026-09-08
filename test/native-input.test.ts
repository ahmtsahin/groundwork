import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error The eval harness is runtime JavaScript by design.
import { nativeResponseFromAnswers, normalizeNativeAnswers } from "../eval/src/simulator.mjs";

const questions = [
  {
    id: "storage",
    header: "Storage",
    question: "Where should state live?",
    options: [
      { label: "Database (Recommended)", description: "Durable." },
      { label: "Memory", description: "Ephemeral." }
    ]
  },
  {
    id: "expiry",
    header: "Expiry",
    question: "When should it expire?",
    options: [
      { label: "One day (Recommended)", description: "Bounded." },
      { label: "Never", description: "Persistent." }
    ]
  }
];

test("native answers are ordered by the questions and fall back deterministically", () => {
  const normalized = normalizeNativeAnswers(questions, [
    { questionId: "expiry", answer: "Never" },
    { questionId: "unknown", answer: "ignored" }
  ]);

  assert.deepEqual(normalized, [
    { questionId: "storage", answer: "Database (Recommended)" },
    { questionId: "expiry", answer: "Never" }
  ]);
});

test("native app-server responses map each id to its answer array", () => {
  const response = nativeResponseFromAnswers([
    { questionId: "storage", answer: "Memory" },
    { questionId: "expiry", answer: "A custom policy" }
  ]);

  assert.deepEqual(response, {
    answers: {
      storage: { answers: ["Memory"] },
      expiry: { answers: ["A custom policy"] }
    }
  });
});

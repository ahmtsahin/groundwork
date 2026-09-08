import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";

import { resolveClaudeCli } from "./claude-cli.mjs";
import { initialPrompt } from "./codex-runner.mjs";
import { answerNativeQuestions, answerTextTurn } from "./simulator.mjs";

/**
 * Drives one Claude Code session over the print-mode stream-json protocol.
 *
 * `--permission-prompt-tool stdio` routes every permission decision, including
 * AskUserQuestion, to this process as a `control_request`. Tool permissions are
 * granted outright: the workspace is a throwaway copy. AskUserQuestion is
 * answered by the persona simulator, which makes it the Claude Code counterpart
 * of the Codex `request_user_input` form.
 *
 * `--safe-mode` keeps the operator's plugins, hooks, skills, CLAUDE.md files,
 * and MCP servers out of the session, so nothing but the arm's instructions
 * and the scenario can shape the run. Authentication is unaffected.
 */

/**
 * AskUserQuestion carries no question ids and keys its answers by question
 * text. Assign ids so the simulator and the judge see the same shape on every
 * host; `askUserQuestionAnswers` maps the answers back to text.
 */
export function nativeQuestionsFromAskUserQuestion(input, round) {
  return (input?.questions ?? []).map((question, index) => ({
    id: `r${round}-q${index + 1}`,
    header: question.header ?? "",
    question: question.question ?? "",
    options: (question.options ?? []).map((option) => ({
      label: option.label,
      description: option.description ?? ""
    })),
    multiSelect: question.multiSelect === true
  }));
}

export function askUserQuestionAnswers(questions, answers) {
  const byId = new Map(answers.map((entry) => [entry.questionId, entry.answer]));

  return Object.fromEntries(
    questions.map((question) => [question.question, byId.get(question.id) ?? ""])
  );
}

/**
 * Claude reports a turn's input split into fresh, cache-written, and cache-read
 * tokens. Fold them into the shape the scorer sums on every host: input is
 * every token the model read, as the Codex `inputTokens` already is, and
 * `cached_input_tokens` is the subset served from cache. `total_cost_usd` on
 * the result is cumulative for the session; the per-turn cost is derived.
 */
export function usageFromClaudeResult(result, cumulativeCostBefore = 0) {
  const usage = result?.usage;

  if (!usage || typeof usage !== "object") {
    return null;
  }

  const fresh = Number(usage.input_tokens ?? 0);
  const created = Number(usage.cache_creation_input_tokens ?? 0);
  const read = Number(usage.cache_read_input_tokens ?? 0);
  const output = Number(usage.output_tokens ?? 0);
  const input = fresh + created + read;
  const cumulativeCost = Number(result.total_cost_usd ?? 0);

  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: input + output,
    cached_input_tokens: read,
    cost_usd: Number((cumulativeCost - cumulativeCostBefore).toFixed(6))
  };
}

function textBlocks(message) {
  return (message?.message?.content ?? [])
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text);
}

export async function runClaudeArm({
  arm,
  scenario,
  persona,
  workspace,
  model,
  maxTurns = 12,
  turnTimeoutMs = 900_000,
  simulatorOptions = {},
  logDir,
  onNativeRound,
  maxBudgetUsd = null
}) {
  mkdirSync(logDir, { recursive: true });

  const cli = resolveClaudeCli();

  if (!cli) {
    throw new Error("No Claude Code CLI found. Install Claude Code or set CLAUDE_CLI_PATH.");
  }

  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--input-format",
    "stream-json",
    "--verbose",
    "--permission-prompt-tool",
    "stdio",
    "--permission-mode",
    "acceptEdits",
    "--safe-mode",
    "--no-session-persistence",
    "--model",
    model
  ];

  if (maxBudgetUsd) {
    args.push("--max-budget-usd", String(maxBudgetUsd));
  }

  const startedAt = Date.now();
  const child = spawn(cli.binary, args, {
    cwd: workspace,
    env: process.env,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });

  const stderrChunks = [];
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
  child.stdin.on("error", () => {});

  const closed = new Promise((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal }));
  });

  const nativeRounds = [];
  const nativeHistory = [];
  const turns = [];
  const userReplies = [];
  let turnEvents = [];
  let turnTexts = [];
  let leadInSegments = [];
  let sessionId = null;
  let aborted = null;
  let waiter = null;
  let cumulativeCost = 0;

  const settleTurn = (outcome, error) => {
    if (!waiter) return;
    const current = waiter;
    waiter = null;
    clearTimeout(current.timer);
    if (error) current.reject(error);
    else current.resolve(outcome);
  };

  const send = (message) => {
    if (!child.stdin.writable) {
      throw new Error("Claude Code stdin is not writable.");
    }
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  const respond = (requestId, response) =>
    send({
      type: "control_response",
      response: { subtype: "success", request_id: requestId, response }
    });

  const handleControlRequest = async (message) => {
    const request = message.request ?? {};

    if (request.subtype !== "can_use_tool") {
      // Anything else (hook callbacks, MCP relays) cannot occur in safe mode;
      // acknowledge so the session never hangs on an unanswered request.
      respond(message.request_id, {});
      return;
    }

    if (request.tool_name !== "AskUserQuestion") {
      respond(message.request_id, { behavior: "allow", updatedInput: request.input });
      return;
    }

    const questions = nativeQuestionsFromAskUserQuestion(request.input, nativeRounds.length + 1);

    if (questions.length < 1 || questions.length > 4) {
      throw new Error("AskUserQuestion must carry one to four questions");
    }

    const leadIn = leadInSegments.filter(Boolean).join("\n\n").trim();
    const answers = await answerNativeQuestions(
      persona,
      { leadIn, questions, history: nativeHistory },
      simulatorOptions
    );
    const record = {
      receivedAt: Date.now(),
      requestId: message.request_id,
      sessionId,
      toolUseId: request.tool_use_id ?? null,
      leadIn,
      questions,
      answers
    };

    nativeRounds.push(record);
    nativeHistory.push(...answers);
    leadInSegments = [];
    onNativeRound?.(record);
    respond(message.request_id, {
      behavior: "allow",
      updatedInput: { ...request.input, answers: askUserQuestionAnswers(questions, answers) }
    });
  };

  const lines = readline.createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    const trimmed = line.trim();

    if (!trimmed) return;

    let message;

    try {
      message = JSON.parse(trimmed);
    } catch {
      turnEvents.push({ type: "unparsed", raw: trimmed });
      return;
    }

    turnEvents.push(message);

    if (message.type === "system" && message.subtype === "init") {
      sessionId = message.session_id ?? sessionId;
    } else if (message.type === "assistant") {
      const texts = textBlocks(message);
      turnTexts.push(...texts);
      leadInSegments.push(...texts);
    } else if (message.type === "control_request") {
      handleControlRequest(message).catch((error) => settleTurn(null, error));
    } else if (message.type === "result") {
      settleTurn(message);
    }
  });

  child.on("error", (error) => settleTurn(null, error));
  closed.then(({ code, signal }) =>
    settleTurn(
      null,
      new Error(
        `Claude Code exited before the turn completed (code ${code ?? "null"}, signal ${signal ?? "none"}).`
      )
    )
  );

  try {
    for (let index = 0; index < maxTurns; index += 1) {
      const isFirst = index === 0;
      const prompt = isFirst
        ? initialPrompt(arm.instructions, scenario.request)
        : userReplies[userReplies.length - 1];
      const turnStartedAt = Date.now();
      turnEvents = [];
      turnTexts = [];
      let result;

      try {
        result = await new Promise((resolve, reject) => {
          waiter = {
            resolve,
            reject,
            timer: setTimeout(
              () => settleTurn(null, new Error(`turn ${index} timed out after ${turnTimeoutMs} ms`)),
              turnTimeoutMs
            )
          };
          send({ type: "user", message: { role: "user", content: prompt } });
        });
      } catch (error) {
        aborted = error instanceof Error ? error.message : String(error);
        break;
      }

      const finalMessage = (
        typeof result.result === "string" && result.result.trim()
          ? result.result
          : (turnTexts[turnTexts.length - 1] ?? "")
      ).trim();
      const errors = [];

      if (result.is_error || (result.subtype && result.subtype !== "success")) {
        errors.push(result.result || result.subtype || "turn failed");
      }

      writeFileSync(
        path.join(logDir, `turn-${index}-events.jsonl`),
        turnEvents.map((event) => JSON.stringify(event)).join("\n"),
        "utf8"
      );
      writeFileSync(path.join(logDir, `turn-${index}-last-message.txt`), finalMessage, "utf8");

      const usage = usageFromClaudeResult(result, cumulativeCost);
      cumulativeCost = Number(result.total_cost_usd ?? cumulativeCost);

      turns.push({
        index,
        kind: isFirst ? "initial" : "follow-up",
        ms: Date.now() - turnStartedAt,
        exitCode: null,
        timedOut: false,
        usage,
        errors,
        eventCount: turnEvents.length,
        finalMessage
      });

      if (errors.length > 0) {
        aborted = errors[0];
        break;
      }
      if (!finalMessage) {
        aborted = `turn ${index} produced no final message`;
        break;
      }

      const verdict = await answerTextTurn(persona, finalMessage, userReplies, simulatorOptions);
      turns[turns.length - 1].textQuestionCount = verdict.questionCount;

      if (verdict.done || !verdict.reply.trim()) break;
      userReplies.push(verdict.reply.trim());
    }
  } finally {
    try {
      child.stdin.end();
    } catch {
      // already closed
    }

    const exited = await Promise.race([
      closed,
      new Promise((resolve) => setTimeout(() => resolve(null), 15_000))
    ]);

    if (!exited) {
      child.kill();
      await closed;
    }

    const stderr = stderrChunks.join("");

    if (stderr.trim()) {
      writeFileSync(path.join(logDir, "claude-stderr.txt"), stderr, "utf8");
    }
  }

  return {
    arm: arm.id,
    host: "claude",
    cli: cli.version.raw,
    scenario: scenario.id,
    model,
    threadId: sessionId,
    startedAt: new Date(startedAt).toISOString(),
    wallClockMs: Date.now() - startedAt,
    aborted,
    costUsd: cumulativeCost,
    turns,
    userReplies,
    nativeRounds
  };
}

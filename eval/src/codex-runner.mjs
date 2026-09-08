import { spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { startAppServer } from "./app-server-client.mjs";
import { resolveCodexCli } from "./codex-cli.mjs";
import {
  answerNativeQuestions,
  answerTextTurn,
  nativeResponseFromAnswers
} from "./simulator.mjs";

const USAGE_KEYS = new Set([
  "input_tokens",
  "output_tokens",
  "total_tokens",
  "inputTokens",
  "outputTokens",
  "totalTokens"
]);

function findUsage(value, found) {
  if (!value || typeof value !== "object") {
    return found;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      found = findUsage(entry, found);
    }
    return found;
  }

  const keys = Object.keys(value);

  if (keys.some((key) => USAGE_KEYS.has(key))) {
    found = {
      input_tokens: Number(value.input_tokens ?? value.inputTokens ?? 0),
      output_tokens: Number(value.output_tokens ?? value.outputTokens ?? 0),
      total_tokens: Number(value.total_tokens ?? value.totalTokens ?? 0)
    };
  }

  for (const key of keys) {
    found = findUsage(value[key], found);
  }

  return found;
}

/** The first turn carries the arm's instructions, if any, and then the task. */
export function initialPrompt(instructions, request) {
  return instructions ? `${instructions}\n\n=== TASK ===\n${request}` : request;
}

/**
 * The app-server reports `total` (the thread so far) and `last` (the most
 * recent request). Read the running total explicitly: scanning for the first
 * object that looks like usage lands on `last` and under-reports a turn by
 * everything but its final request.
 */
export function usageFromTokenUsage(params) {
  const total = params?.tokenUsage?.total;

  if (!total || typeof total !== "object") {
    return null;
  }

  return {
    input_tokens: Number(total.inputTokens ?? 0),
    output_tokens: Number(total.outputTokens ?? 0),
    total_tokens: Number(total.totalTokens ?? 0),
    cached_input_tokens: Number(total.cachedInputTokens ?? 0),
    reasoning_output_tokens: Number(total.reasoningOutputTokens ?? 0)
  };
}

/** Turn usage is the thread total after the turn minus the total before it. */
export function subtractUsage(after, before) {
  const result = {};

  for (const key of Object.keys(after)) {
    result[key] = Number(after[key] ?? 0) - Number(before?.[key] ?? 0);
  }

  return result;
}

function runCodexExec(binary, args, { cwd, env, timeoutMs, stdin }) {
  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });

    child.stdin.on("error", () => {});
    child.stdin.end(stdin ?? "");

    const events = [];
    const stderr = [];
    let stdoutTail = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutTail += chunk;
      const lines = stdoutTail.split("\n");
      stdoutTail = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) continue;

        try {
          events.push(JSON.parse(trimmed));
        } catch {
          events.push({ type: "unparsed", raw: trimmed });
        }
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => stderr.push(chunk));

    child.on("close", (code) => {
      clearTimeout(timer);

      if (stdoutTail.trim()) {
        try {
          events.push(JSON.parse(stdoutTail.trim()));
        } catch {
          events.push({ type: "unparsed", raw: stdoutTail.trim() });
        }
      }

      resolve({ code, events, stderr: stderr.join(""), timedOut });
    });
  });
}

function summarizeExecTurn(result) {
  let threadId;
  let usage;
  const errors = [];

  for (const event of result.events) {
    if (event.type === "thread.started" && event.thread_id) {
      threadId = event.thread_id;
    }

    if (event.type === "error" && event.message) {
      errors.push(String(event.message));
    }

    if (event.type === "turn.failed" && event.error?.message) {
      errors.push(String(event.error.message));
    }

    usage = findUsage(event, usage);
  }

  return { threadId, usage, errors };
}

async function runTextArm({
  arm,
  scenario,
  persona,
  workspace,
  model,
  maxTurns,
  turnTimeoutMs,
  simulatorOptions,
  logDir
}) {
  const cli = resolveCodexCli();

  if (!cli) throw new Error("No Codex CLI found.");

  const startedAt = Date.now();
  const turns = [];
  const userReplies = [];
  let threadId;
  let aborted = null;

  const baseArgs = [
    "--json",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "-m",
    model
  ];

  // The elevated Windows sandbox launches a setup helper through a UAC prompt
  // on every process; an unattended run whose prompt lapses fails every
  // command with error 1223 and the model never sees the repository. The
  // unelevated sandbox needs no prompt, and the workspace is a throwaway copy.
  if (process.platform === "win32") {
    baseArgs.push("-c", 'windows.sandbox="unelevated"');
  }

  baseArgs.push("-c", 'sandbox_mode="workspace-write"');

  for (const feature of arm.enableFeatures ?? []) {
    baseArgs.push("--enable", feature);
  }

  for (let index = 0; index < maxTurns; index += 1) {
    const outputPath = path.join(logDir, `turn-${index}-last-message.txt`);
    writeFileSync(outputPath, "", "utf8");

    const isFirst = index === 0;
    const prompt = isFirst
      ? initialPrompt(arm.instructions, scenario.request)
      : userReplies[userReplies.length - 1];
    const args = isFirst
      ? [
          "exec",
          ...baseArgs,
          "-C",
          workspace,
          "--output-last-message",
          outputPath,
          "-"
        ]
      : [
          "exec",
          "resume",
          threadId,
          ...baseArgs,
          "--output-last-message",
          outputPath,
          "-"
        ];

    const turnStartedAt = Date.now();
    const result = await runCodexExec(cli.binary, args, {
      cwd: workspace,
      env: process.env,
      timeoutMs: turnTimeoutMs,
      stdin: prompt
    });

    writeFileSync(
      path.join(logDir, `turn-${index}-events.jsonl`),
      result.events.map((event) => JSON.stringify(event)).join("\n"),
      "utf8"
    );

    if (result.stderr.trim()) {
      writeFileSync(
        path.join(logDir, `turn-${index}-stderr.txt`),
        result.stderr,
        "utf8"
      );
    }

    const summary = summarizeExecTurn(result);
    threadId ??= summary.threadId;
    const finalMessage = existsSync(outputPath)
      ? readFileSync(outputPath, "utf8").trim()
      : "";

    turns.push({
      index,
      kind: isFirst ? "initial" : "resume",
      ms: Date.now() - turnStartedAt,
      exitCode: result.code,
      timedOut: result.timedOut,
      usage: summary.usage ?? null,
      errors: summary.errors,
      eventCount: result.events.length,
      finalMessage
    });

    if (result.timedOut) {
      aborted = `turn ${index} timed out`;
      break;
    }
    if (summary.errors.length > 0) {
      aborted = summary.errors[0];
      break;
    }
    if (!finalMessage) {
      aborted = `turn ${index} produced no final message`;
      break;
    }

    const verdict = await answerTextTurn(
      persona,
      finalMessage,
      userReplies,
      simulatorOptions
    );
    turns[turns.length - 1].textQuestionCount = verdict.questionCount;

    if (verdict.done || !verdict.reply.trim()) break;
    userReplies.push(verdict.reply.trim());
  }

  return {
    arm: arm.id,
    host: "codex",
    scenario: scenario.id,
    model,
    threadId: threadId ?? null,
    startedAt: new Date(startedAt).toISOString(),
    wallClockMs: Date.now() - startedAt,
    aborted,
    turns,
    userReplies,
    nativeRounds: []
  };
}

function createIsolatedCodexHome() {
  const sourceHome = process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
  const authSource = path.join(sourceHome, "auth.json");

  if (!existsSync(authSource)) {
    throw new Error(
      `Cannot isolate the native eval: ${authSource} is missing. Sign in with Codex first.`
    );
  }

  const isolatedHome = mkdtempSync(path.join(os.tmpdir(), "groundwork-native-home-"));
  copyFileSync(authSource, path.join(isolatedHome, "auth.json"));
  return isolatedHome;
}

function finalAgentMessage(messages) {
  const final = [...messages].reverse().find((item) => item.phase === "final");
  return (final ?? messages[messages.length - 1])?.text?.trim() ?? "";
}

async function runNativeArm({
  arm,
  scenario,
  persona,
  workspace,
  model,
  maxTurns,
  turnTimeoutMs,
  simulatorOptions,
  logDir,
  onNativeRound
}) {
  const cli = resolveCodexCli();

  if (!cli) throw new Error("No Codex CLI found.");

  const startedAt = Date.now();
  const isolatedHome = createIsolatedCodexHome();
  const messages = [];
  const messagesByTurn = new Map();
  const completedTurns = new Map();
  const turnWaiters = new Map();
  const leadInSegments = [];
  const deltaBuffers = new Map();
  const nativeRounds = [];
  const nativeHistory = [];
  const turns = [];
  const userReplies = [];
  let activeTurnId = null;
  let client;
  let threadId = null;
  let aborted = null;
  let threadUsage = null;
  let usageBeforeTurn = null;

  const completeTurn = (turn) => {
    completedTurns.set(turn.id, turn);
    const waiter = turnWaiters.get(turn.id);

    if (waiter) {
      turnWaiters.delete(turn.id);
      clearTimeout(waiter.timer);
      waiter.resolve(turn);
    }
  };

  const waitForTurn = (turnId) => {
    if (completedTurns.has(turnId)) {
      return Promise.resolve(completedTurns.get(turnId));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        turnWaiters.delete(turnId);
        reject(new Error(`turn ${turnId} timed out after ${turnTimeoutMs} ms`));
      }, turnTimeoutMs);

      turnWaiters.set(turnId, { resolve, reject, timer });
    });
  };

  const onNotification = (message) => {
    const { method, params = {} } = message;

    if (method === "item/agentMessage/delta") {
      deltaBuffers.set(
        params.itemId,
        `${deltaBuffers.get(params.itemId) ?? ""}${params.delta ?? ""}`
      );
    } else if (method === "item/completed" && params.item?.type === "agentMessage") {
      const item = params.item;
      const bucket = messagesByTurn.get(params.turnId) ?? [];
      bucket.push(item);
      messagesByTurn.set(params.turnId, bucket);
      leadInSegments.push(item.text ?? deltaBuffers.get(item.id) ?? "");
      deltaBuffers.delete(item.id);
    } else if (method === "thread/tokenUsage/updated") {
      threadUsage = usageFromTokenUsage(params) ?? threadUsage;
    } else if (method === "turn/completed" && params.turn?.id) {
      completeTurn(params.turn);
    }
  };

  const onServerRequest = async (message) => {
    if (message.method !== "item/tool/requestUserInput") {
      throw new Error(`Unexpected native app-server request: ${message.method}`);
    }

    const questions = message.params?.questions;

    if (!Array.isArray(questions) || questions.length < 1 || questions.length > 3) {
      throw new Error("request_user_input must carry one to three questions");
    }

    const buffered = [...deltaBuffers.values()].filter(Boolean);
    const leadIn = [...leadInSegments, ...buffered].filter(Boolean).join("\n\n").trim();
    const answers = await answerNativeQuestions(
      persona,
      { leadIn, questions, history: nativeHistory },
      simulatorOptions
    );
    const record = {
      receivedAt: Date.now(),
      requestId: message.id,
      threadId: message.params.threadId,
      turnId: message.params.turnId,
      itemId: message.params.itemId,
      leadIn,
      questions,
      answers
    };

    nativeRounds.push(record);
    nativeHistory.push(...answers);
    leadInSegments.length = 0;
    deltaBuffers.clear();
    onNativeRound?.(record);
    return nativeResponseFromAnswers(answers);
  };

  try {
    client = await startAppServer({
      binary: cli.binary,
      cwd: workspace,
      env: { ...process.env, CODEX_HOME: isolatedHome },
      enableFeatures: [
        ...new Set([
          "default_mode_request_user_input",
          ...(arm.enableFeatures ?? [])
        ])
      ],
      onMessage: (message) => messages.push(message),
      onNotification,
      onServerRequest,
      requestTimeoutMs: 60_000
    });

    const started = await client.request(
      "thread/start",
      {
        model,
        cwd: workspace,
        approvalPolicy: "never",
        sandbox: "workspace-write",
        ephemeral: true,
        runtimeWorkspaceRoots: [workspace]
      },
      60_000
    );
    threadId = started.thread.id;

    for (let index = 0; index < maxTurns; index += 1) {
      const isFirst = index === 0;
      const prompt = isFirst
        ? initialPrompt(arm.instructions, scenario.request)
        : userReplies[userReplies.length - 1];
      const messageStart = messages.length;
      const turnStartedAt = Date.now();
      let turn;

      try {
        const response = await client.request(
          "turn/start",
          {
            threadId,
            input: [{ type: "text", text: prompt }]
          },
          60_000
        );
        activeTurnId = response.turn.id;
        turn = await waitForTurn(activeTurnId);
      } catch (error) {
        aborted = error instanceof Error ? error.message : String(error);
        break;
      }

      const turnMessages = messagesByTurn.get(activeTurnId) ?? [];
      const finalMessage = finalAgentMessage(turnMessages);
      const errors = [];

      if (turn.status === "failed" || turn.error) {
        errors.push(turn.error?.message ?? `turn ended with status ${turn.status}`);
      }

      const turnEvents = messages.slice(messageStart);
      writeFileSync(
        path.join(logDir, `turn-${index}-events.jsonl`),
        turnEvents.map((event) => JSON.stringify(event)).join("\n"),
        "utf8"
      );
      writeFileSync(
        path.join(logDir, `turn-${index}-last-message.txt`),
        finalMessage,
        "utf8"
      );

      const turnUsage = threadUsage ? subtractUsage(threadUsage, usageBeforeTurn) : null;
      usageBeforeTurn = threadUsage ?? usageBeforeTurn;

      turns.push({
        index,
        kind: isFirst ? "initial" : "follow-up",
        ms: Date.now() - turnStartedAt,
        exitCode: null,
        timedOut: false,
        usage: turnUsage,
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

      const verdict = await answerTextTurn(
        persona,
        finalMessage,
        userReplies,
        simulatorOptions
      );
      turns[turns.length - 1].textQuestionCount = verdict.questionCount;

      if (verdict.done || !verdict.reply.trim()) break;
      userReplies.push(verdict.reply.trim());
    }
  } finally {
    if (client) {
      await client.close();
      if (client.stderr.trim()) {
        writeFileSync(
          path.join(logDir, "app-server-stderr.txt"),
          client.stderr,
          "utf8"
        );
      }
    }
    rmSync(isolatedHome, { recursive: true, force: true });
  }

  return {
    arm: arm.id,
    host: "codex",
    scenario: scenario.id,
    model,
    threadId,
    startedAt: new Date(startedAt).toISOString(),
    wallClockMs: Date.now() - startedAt,
    aborted,
    turns,
    userReplies,
    nativeRounds
  };
}

export async function runCodexArm({
  arm,
  scenario,
  persona,
  workspace,
  model,
  maxTurns = 12,
  turnTimeoutMs = 900_000,
  simulatorOptions = {},
  logDir,
  onNativeRound
}) {
  mkdirSync(logDir, { recursive: true });

  const options = {
    arm,
    scenario,
    persona,
    workspace,
    model,
    maxTurns,
    turnTimeoutMs,
    simulatorOptions,
    logDir,
    onNativeRound
  };

  return arm.channel === "native"
    ? runNativeArm(options)
    : runTextArm(options);
}

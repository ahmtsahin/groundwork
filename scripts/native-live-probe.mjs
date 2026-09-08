import path from "node:path";

import { startAppServer } from "../eval/src/app-server-client.mjs";
import { resolveCodexCli } from "../eval/src/codex-cli.mjs";

const cli = resolveCodexCli();

if (!cli) {
  throw new Error("No Codex CLI found.");
}

const cwd = process.cwd();
const agentMessages = [];
let sawNativeRequest = false;
let completedTurn = null;
let completeTurn;
const turnCompleted = new Promise((resolve) => {
  completeTurn = resolve;
});

const client = await startAppServer({
  binary: cli.binary,
  cwd,
  enableFeatures: ["default_mode_request_user_input"],
  onNotification(message) {
    if (
      message.method === "item/completed" &&
      message.params?.item?.type === "agentMessage"
    ) {
      agentMessages.push(message.params.item.text ?? "");
    }

    if (message.method === "turn/completed") {
      completedTurn = message.params?.turn ?? null;
      completeTurn(completedTurn);
    }
  },
  async onServerRequest(message) {
    if (message.method !== "item/tool/requestUserInput") {
      throw new Error(`Unexpected app-server request: ${message.method}`);
    }

    const questions = message.params?.questions;

    if (!Array.isArray(questions) || questions.length !== 1) {
      throw new Error("Live probe expected exactly one native question.");
    }

    const question = questions[0];
    const answer = question.options?.[0]?.label;

    if (!question.id || !answer) {
      throw new Error("Live probe received an invalid native question shape.");
    }

    sawNativeRequest = true;
    return {
      answers: {
        [question.id]: { answers: [answer] }
      }
    };
  }
});

try {
  const started = await client.request("thread/start", {
    model: process.env.CODEX_PROBE_MODEL ?? "gpt-5.6-luna",
    cwd,
    approvalPolicy: "never",
    sandbox: "read-only",
    ephemeral: true,
    runtimeWorkspaceRoots: [path.resolve(cwd)]
  });
  const turn = await client.request("turn/start", {
    threadId: started.thread.id,
    input: [
      {
        type: "text",
        text: [
          "You are in Default mode.",
          "Call request_user_input exactly once with id `native-probe`, header",
          "`Native`, one short question asking whether to continue, and two",
          "options. Put `Continue (Recommended)` first.",
          "After the tool returns, reply with exactly NATIVE_OK.",
          "Do not call any other tool."
        ].join(" ")
      }
    ]
  });

  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Native live probe timed out.")),
      180_000
    );
  });

  try {
    await Promise.race([turnCompleted, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!sawNativeRequest) {
    throw new Error("The model completed without calling native request_user_input.");
  }

  if (completedTurn?.id !== turn.turn.id || completedTurn?.status === "failed") {
    throw new Error("The native probe turn did not complete successfully.");
  }

  const finalMessage = agentMessages.at(-1)?.trim();

  if (finalMessage !== "NATIVE_OK") {
    throw new Error(`Unexpected native probe final message: ${finalMessage || "(empty)"}`);
  }

  console.log("Native Default-mode request_user_input live probe passed.");
} finally {
  await client.close();
}

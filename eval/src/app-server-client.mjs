import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import readline from "node:readline";

// The eval client reports the repository version so app-server logs match releases.
const { version: packageVersion } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
);

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export class AppServerClient {
  constructor(child, options = {}) {
    this.child = child;
    this.onMessage = options.onMessage;
    this.onNotification = options.onNotification;
    this.onServerRequest = options.onServerRequest;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 60_000;
    this.nextId = 1;
    this.pending = new Map();
    this.stderrChunks = [];
    child.on("error", (error) => {
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(error);
      }
      this.pending.clear();
    });
    this.closed = new Promise((resolve) => {
      child.once("close", (code, signal) => {
        const reason = new Error(
          `Codex app-server closed (code ${code ?? "null"}, signal ${signal ?? "none"}).`
        );

        for (const entry of this.pending.values()) {
          clearTimeout(entry.timer);
          entry.reject(reason);
        }
        this.pending.clear();
        resolve({ code, signal });
      });
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => this.stderrChunks.push(chunk));

    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => this.#handleLine(line));
  }

  get stderr() {
    return this.stderrChunks.join("");
  }

  #send(message) {
    if (!this.child.stdin.writable) {
      throw new Error("Codex app-server stdin is not writable.");
    }

    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #handleLine(line) {
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    let message;

    try {
      message = JSON.parse(trimmed);
    } catch {
      this.onMessage?.({ type: "unparsed", raw: trimmed });
      return;
    }

    this.onMessage?.(message);

    if (message.method && message.id !== undefined) {
      void this.#answerServerRequest(message);
      return;
    }

    if (message.id !== undefined && this.pending.has(message.id)) {
      const entry = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(entry.timer);

      if (message.error) {
        entry.reject(
          new Error(
            `${entry.method} failed: ${message.error.message ?? JSON.stringify(message.error)}`
          )
        );
      } else {
        entry.resolve(message.result);
      }
      return;
    }

    if (message.method) {
      this.onNotification?.(message);
    }
  }

  async #answerServerRequest(message) {
    try {
      if (!this.onServerRequest) {
        throw new Error(`Unhandled app-server request: ${message.method}`);
      }

      const result = await this.onServerRequest(message);
      this.#send({ id: message.id, result });
    } catch (error) {
      this.#send({
        id: message.id,
        error: { code: -32000, message: errorMessage(error) }
      });
    }
  }

  request(method, params = {}, timeoutMs = this.requestTimeoutMs) {
    const id = this.nextId;
    this.nextId += 1;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs} ms.`));
      }, timeoutMs);

      this.pending.set(id, { method, resolve, reject, timer });

      try {
        this.#send({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  notify(method, params = {}) {
    this.#send({ method, params });
  }

  async close() {
    if (this.child.stdin.writable) {
      this.child.stdin.end();
    }

    let timeoutId;
    const timeout = new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve({ timedOut: true }), 5_000);
    });
    const result = await Promise.race([this.closed, timeout]);

    if (result?.timedOut) {
      this.child.kill();
      return this.closed;
    }

    clearTimeout(timeoutId);
    return result;
  }
}

export async function startAppServer({
  binary,
  cwd,
  env = process.env,
  enableFeatures = [],
  onMessage,
  onNotification,
  onServerRequest,
  requestTimeoutMs
}) {
  const args = ["app-server", "--stdio"];

  for (const feature of enableFeatures) {
    args.push("--enable", feature);
  }

  // Unelevated: the elevated sandbox needs a UAC prompt per process, which an
  // unattended run cannot answer (see codex-runner.mjs).
  if (process.platform === "win32") {
    args.push("-c", 'windows.sandbox="unelevated"');
  }

  const child = spawn(binary, args, {
    cwd,
    env,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  const client = new AppServerClient(child, {
    onMessage,
    onNotification,
    onServerRequest,
    requestTimeoutMs
  });

  try {
    await client.request("initialize", {
      clientInfo: {
        name: "groundwork-eval",
        title: "Groundwork Eval",
        version: packageVersion
      },
      capabilities: { experimentalApi: true }
    });
    client.notify("initialized", {});
    return client;
  } catch (error) {
    await client.close();
    throw error;
  }
}

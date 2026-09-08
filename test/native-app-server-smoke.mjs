import os from "node:os";

import { startAppServer } from "../eval/src/app-server-client.mjs";
import { resolveCodexCli } from "../eval/src/codex-cli.mjs";

const cli = resolveCodexCli();

if (!cli) {
  throw new Error("No Codex CLI found.");
}

const client = await startAppServer({
  binary: cli.binary,
  cwd: os.tmpdir(),
  enableFeatures: ["default_mode_request_user_input"]
});

await client.close();
console.log("Native Codex app-server handshake passed.");

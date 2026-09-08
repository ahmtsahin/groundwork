import {
  inspectNativeInputFeature,
  resolveCodexCli
} from "../eval/src/codex-cli.mjs";

const cli = resolveCodexCli();

if (!cli) {
  console.error("Codex CLI was not found. Install Codex or set CODEX_CLI_PATH.");
  process.exitCode = 1;
} else {
  const feature = inspectNativeInputFeature(cli);

  console.log(`Codex CLI: ${cli.version.raw}`);

  if (!feature.supported) {
    console.error(
      "This Codex build does not expose default_mode_request_user_input. Update Codex."
    );
    process.exitCode = 1;
  } else if (!feature.enabled) {
    console.error(
      "Native Default-mode input is disabled. Run: codex features enable default_mode_request_user_input"
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Native Default-mode input is enabled (${feature.stage ?? "unknown stage"}).`
    );
  }
}

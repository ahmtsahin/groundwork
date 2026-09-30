# Groundwork evaluation harness

This optional harness evaluates Groundwork on repository fixtures with a
simulated user and a rubric. Native variants use the host's question tool;
the text variant and no-skill controls provide internal baselines.

Evaluation is separate from installation. Runs, rejudging, and the native
live probe consume model usage. Build, unit tests, doctor, and smoke checks
make no model calls.

## Requirements

- Node.js 22.17.0 or newer and the development dependencies (`npm ci`).
- A signed-in Codex CLI for Codex runs, the persona simulator, and the judge.
- A signed-in Claude Code CLI for Claude Code runs.
- Native Default-mode input enabled for Codex.
- Network access for the two rival arms, which are fetched from pinned
  commits of their own repositories when arms are prepared.

```sh
codex features enable default_mode_request_user_input
npm run eval:doctor
```

The doctor checks available CLIs, the native feature, instruction sources,
and scenario fixtures. It prepares local instruction caches in `eval/.arms/`.

## Run a scenario

The native Codex package:

```sh
npm run eval -- --scenario stale-exports --arms settle
```

The native Claude Code package, using the same simulator and judge:

```sh
npm run eval -- --scenario stale-exports --arms settle-claude --claude-model opus
```

Compare the native package with its text variant and no-skill control:

```sh
npm run eval -- --scenario bulk-rename --arms settle,settle-text,no-skill --repeats 3
```

Select a configured model with `--model`; Claude Code's agent model uses
`--claude-model`. Defaults and the Claude per-run budget live in `eval/arms.json`.
The simulator and judge run on Codex for both hosts.

## Compare arms in rounds

`run` measures arm after arm, so a run that stops early leaves some arms
complete and others unmeasured. For a comparison, run one repeat of every arm
per round with the order rotated each round; any prefix of the run is then a
complete comparison, and a stopped run resumes from its last finished repeat:

```sh
npm run eval:compare -- --scenario stale-exports --arms no-skill,settle,settle-text,grilling,superpowers-brainstorming --rounds 5
```

Pass `--results <dir>` to resume; the manifest refuses to continue when an
arm's instructions or the model changed since the run started. Render one or
more results directories as Markdown tables, without model calls, with:

```sh
npm run eval:summary -- eval/results/<dir> [eval/results/<dir> ...]
```

## Included variants

| Arm ID | Instructions | Channel |
|---|---|---|
| `settle` | Groundwork skill on Codex | Native |
| `settle-text` | Shared skill with a text-question adapter | Text |
| `settle-compact` | Compact experimental variant | Native |
| `settle-interrogate` | Experimental questioning variant | Native |
| `no-skill` | Task alone on Codex | Text |
| `grilling` | `grilling` from mattpocock/skills, pinned commit | Text |
| `superpowers-brainstorming` | `brainstorming` from obra/superpowers v6.4.2 | Text |
| `settle-claude` | Groundwork skill on Claude Code | Native |
| `no-skill-claude` | Task alone on Claude Code | Text |

The settle variants and the controls come from this repository. The two rival
arms are fetched from pinned commits of their own repositories when arms are
prepared and cached under `eval/.arms/`; nothing of theirs is vendored. They
run as instruction text on the text channel, the way `settle-text` does,
without the rest of their plugins.

## Scenarios

| Scenario | Path | Behavior under evaluation |
|---|---|---|
| `stale-exports` | Bounded | Freshness, snapshot behavior, and failures in an export flow. |
| `bulk-rename` | Bounded | Collision handling and safe behavior during a batch rename. |
| `report-delivery` | Architectural | Delivery approaches and contracts for a new reporting subsystem. |

Each scenario has an English request, a fixture workspace, a user persona,
and a rubric. Repository facts should be discovered from the fixture; product
decisions must be elicited from the persona.

## How runs work

Every Codex process the harness starts, whether it runs an agent on either
channel, the simulated user, or the judge, gets a temporary Codex home that
holds only the existing sign-in file, so the operator's configuration,
installed skills, and plugins never reach a run. Temporary homes and
workspaces are cleaned up afterwards.

Native Codex runs start `codex app-server --stdio` with
`default_mode_request_user_input` enabled. The runner copies the fixture into
a temporary workspace and starts an ephemeral task. It receives
`item/tool/requestUserInput` requests and sends the simulator's answers back
to the same request.

Claude Code runs use `claude -p` with stream-json input and output and
`--permission-prompt-tool stdio`. `AskUserQuestion` requests are answered
through `updatedInput.answers` and recorded with stable synthetic IDs. The
runner uses `--safe-mode` to isolate operator plugins, hooks, and skills.

Text runs use chat replies: one `codex exec` per turn, each later turn
resuming the thread with the simulated user's reply. A native run that asks
in prose incurs an extra user message, making that behavior visible in the
results. On Windows, the
Codex runners select the unelevated sandbox for unattended execution.

## Results and scoring

Results are written to `eval/results/` and stay out of version control:

| File | Contents |
|---|---|
| `native-rounds.json` | Question payloads, preceding context, and answers. |
| `run.json` | Timing, turns, replies, usage, and session metadata. |
| `diff.txt` | Workspace changes captured after the run. |
| `judge.json` | Rubric decisions and question-quality findings. |
| `scores.json`, `report.txt` | Aggregate scores and a readable report. |
| Event streams and stderr | Local diagnostics for failed or unexpected runs. |

The judge scores material-decision closure, unnecessary questions,
recommendations, repository evidence, decision retention, implementation
outcomes, path selection, and approach comparisons. Results also record
wall time, tokens, native rounds, and chat replies.

`humanInputs` counts native rounds plus chat replies. `userMessages` alone
does not count answers submitted through a native form. Token totals include
cache reads; on Codex 0.158 and newer, where a resumed `codex exec` reports
the thread's running total, `run.json` keeps that report as `reportedUsage`
and the turn's own share as `usage`. Treat model-judged scores as evidence to
inspect, not a guarantee
of correctness, and report the model, scenario, repeat count, and variation
with any measurements.

The run command exits unsuccessfully if any attempted run throws or aborts;
completed results are still saved for inspection.

## Rejudge a local run

```sh
node eval/src/run.mjs rejudge eval/results/stale-exports-YYYY-MM-DDTHH-MM-SS --scenario stale-exports
```

Rejudging uses saved questions, metadata, and diffs to update the judge output
and reports without repeating the implementation run. It still calls the
judge model. Runs without `native-rounds.json` are skipped with a warning.

## Native acceptance probe

```sh
npm run native:probe
```

This starts one live model turn that must issue `request_user_input`, receive
a native answer, and finish with `NATIVE_OK`. The ordinary smoke check only
verifies the app-server handshake and does not exercise a model or the UI.

## Published results

The comparison of 30 September 2026, five repeats of every arm on both
bounded scenarios, is written up in [RESULTS.md](RESULTS.md). The judge
output, question payloads, final messages, and diffs of its fifty runs are
under `eval/published/2026-09-30/`, and `npm run eval:summary` renders them.

# Comparison: settle against no skill, grilling, and brainstorming

Measured 29–30 September 2026.

## Summary

Five instruction sets were run on two bounded repository tasks, five times
each, with one model acting as the coding agent, the simulated user, and the
judge. Fifty runs in total; every run completed.

- **Without a skill, Codex asked no questions in 10 of 10 runs.** It settled
  one of nine material decisions on `stale-exports` and one of eight on
  `bulk-rename` by itself, decided the rest silently, and still met every
  acceptance statement on `stale-exports`. Silent assumptions do not fail
  tests.
- **settle (native forms)** settled a median 0.89 and 0.75 of the material
  decisions with four native forms per task. Every question it asked cited a
  specific repository fact (median evidence rate 1.0 on both tasks), it
  declared the work's path correctly in 10 of 10 runs, and it never asked a
  question the repository already answered.
- **grilling** reached 1.0 and 0.63 with 1.6 to 2 times the questions, five
  to six chat replies per task, roughly 40% more tokens, and questions that
  rarely cited the repository (0.3 and 0.0). It re-asked a repository-settled
  question in 2 of 10 runs.
- **brainstorming** (superpowers 6.4.2) asked one or two questions, cost the
  least of the skills, and settled 0.78 and 0.63.
- **No arm reliably delivered `bulk-rename`'s absolute safety guarantees.**
  Settling decisions did not turn into code guarantees for any of them.

## Setup

| | |
|---|---|
| Harness | this repository at commit `fb7422c` (v0.5.0), `eval/` |
| Model | `gpt-5.6-sol` for the agent, the simulated user, and the judge; default reasoning effort |
| Codex | CLI 0.158.0-alpha.2.1, Windows 11, unelevated sandbox, workspace-write |
| Repeats | 5 per arm and scenario, 50 runs |
| Schedule | round-robin: each round ran one repeat of every arm with the order rotated, so arms were measured interleaved over the same two hours rather than hours apart; the two scenarios ran as parallel lanes, 22:36–00:57 UTC |
| Isolation | every Codex process ran with a `CODEX_HOME` that held only the sign-in file, so the operator's configuration, skills, and plugins were absent from all arms alike |
| Retries | one run (settle text, round 3) produced no final message on its first attempt and was rerun; nothing else was retried |

### Arms

| Arm | Channel | Instructions | Size |
|---|---|---|---|
| no skill | text | the task alone | 0 chars |
| settle (native) | native `request_user_input` | `plugin/skills/settle/SKILL.md` | 16,772 chars |
| settle (text) | text | the same file with its native question section replaced by `eval/hosts/text/native-question-tool.md` | 15,555 chars |
| grilling | text | `mattpocock/skills` at `d81f3a1` (main, 29 September 2026); `skills/productivity/grilling/SKILL.md`, last changed 20 August 2026 | 2,054 chars |
| brainstorming | text | `obra/superpowers` v6.4.2 (`8ca22db`, 25 September 2026); `skills/brainstorming/SKILL.md`, last changed in v6.4.1 | 17,537 chars |

The rival skills ran as instruction text on the text channel, the way settle's
text variant does: the first turn carries the skill followed by the task. Their
surrounding plugins were not installed, so grilling's sub-agent dispatch and
brainstorming's sibling skills, visual companion, and session hooks were
unavailable. Sizes include the harness's short wrapper line.

### Scenarios

| Scenario | Request | Material decisions | Forbidden questions |
|---|---|---|---|
| `stale-exports` | "Exports in reportkit sometimes show stale data. Fix this." | 4 core + 5 depth | 5 |
| `bulk-rename` | "renamer stops halfway through when a name already exists. Fix this." | 3 core + 5 depth | 6 |

Both are bounded changes to an existing flow. A material decision is one the
persona, not the repository, is the authority on; a forbidden question is one
the repository already answers. Fixtures, personas, and rubrics are under
`eval/scenarios/`.

### Metrics

All figures are per run and reported as median (range) over five runs. Rates
are shares; counts are counts.

| Metric | Meaning |
|---|---|
| Decision questions | questions put to the user, excluding approval gates |
| Human inputs | keyboard interactions on either channel: native forms answered plus chat replies typed |
| Evidence | share of decision questions citing a specific repository fact |
| Single-axis | share of decision questions whose options differ in exactly one respect |
| Recommendation accepted | share of recommendations the simulated user chose |
| Closure | share of material decisions not left to a silent assumption, however settled: asked, settled from repository evidence, or volunteered by the user |
| Silently assumed | material decisions nobody settled |
| Forbidden asked | questions the repository already answered |
| Kept in the code | settled decisions still honored in the final work |
| Path declared | whether the agent declared the expected sizing before its first question |
| Tokens | thread total including cached input, all turns |

## Results

### stale-exports

| Metric | no skill | settle (native) | settle (text) | grilling | brainstorming |
| --- | ---: | ---: | ---: | ---: | ---: |
| Decision questions asked | 0 | 6 (4–7) | 8 (4–13) | 12 (6–19) | 1 (1–2) |
| Human inputs | 0 | 4 (4–5) | 5 (4–7) | 5 (5–8) | 2 (2–3) |
| Questions citing repository evidence | — | 1.0 (0.86–1) | 0.8 (0.61–1) | 0.3 (0–0.5) | 1.0 (0–1) |
| Single-axis questions | — | 0.71 (0.5–0.83) | 0.75 (0.29–0.92) | 0.67 (0.5–0.8) | 0 (0–0.5) |
| Recommendation accepted | — | 0.75 (0.43–0.83) | 0.77 (0.75–1) | 0.84 (0.67–1) | 1.0 |
| Core decisions settled | 0.25 | 1.0 | 1.0 (0.75–1) | 1.0 (0.75–1) | 1.0 |
| Depth decisions settled | 0 | 0.8 (0.8–1) | 1.0 (0.8–1) | 1.0 (0.8–1) | 0.6 (0.2–0.8) |
| Closure | 0.11 | 0.89 (0.89–1) | 1.0 (0.89–1) | 1.0 (0.89–1) | 0.78 (0.56–0.89) |
| Silently assumed | 8 | 1 (0–1) | 0 (0–1) | 0 (0–1) | 2 (1–4) |
| Settled from the repository, no question | 1 | 0 (0–2) | 0 (0–3) | 0 | 1 (0–1) |
| Forbidden asked | 0 | 0 | 0 | 0 (0–1) | 0 |
| Settled decisions kept in the code | 1.0 | 1.0 | 1.0 (0.89–1) | 1.0 | 1.0 |
| Path declared correctly | 0/5 | 5/5 | 5/5 | 0/5 | 1/5 |
| Tokens | 188k (144k–243k) | 500k (474k–546k) | 432k (325k–507k) | 690k (354k–1,051k) | 340k (272k–371k) |
| Seconds | 95 (67–132) | 301 (283–364) | 301 (200–368) | 441 (331–571) | 141 (122–220) |

Runs in which each material decision was silently assumed:

| Decision (tier) | no skill | settle (native) | settle (text) | grilling | brainstorming |
| --- | ---: | ---: | ---: | ---: | ---: |
| freshness-scope (core) | 5/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| staleness-bound (core) | 5/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| nightly-budget (core) | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| interface-shape (core) | 5/5 | 0/5 | 1/5 | 1/5 | 0/5 |
| snapshot-consistency (depth) | 5/5 | 0/5 | 0/5 | 0/5 | 3/5 |
| concurrent-change (depth) | 5/5 | 0/5 | 0/5 | 0/5 | 3/5 |
| change-detection (depth) | 5/5 | 4/5 | 0/5 | 0/5 | 1/5 |
| failure-output (depth) | 5/5 | 0/5 | 0/5 | 1/5 | 2/5 |
| retry-policy (depth) | 5/5 | 0/5 | 1/5 | 0/5 | 4/5 |

Forbidden questions asked: grilling asked about the CSV column order in 1 of 5
runs. No other arm asked one.

Acceptance, as judged from the resulting file changes: every arm met all four
statements in 5 of 5 runs (an ad hoc export can produce data newer than the
six hour TTL; the CSV header, the dependency ban, and the nightly batch's use
of cached rows are preserved).

### bulk-rename

| Metric | no skill | settle (native) | settle (text) | grilling | brainstorming |
| --- | ---: | ---: | ---: | ---: | ---: |
| Decision questions asked | 0 | 7 (5–9) | 12 (7–21) | 11 (9–19) | 2 (1–7) |
| Human inputs | 0 | 4 (3–5) | 7 (5–11) | 6 (4–7) | 3 (2–12) |
| Questions citing repository evidence | — | 1.0 (0.8–1) | 0.54 (0.43–1) | 0 (0–0.16) | 0 (0–0.29) |
| Single-axis questions | — | 1.0 (0.57–1) | 0.91 (0.63–1) | 0.82 (0.67–0.86) | 0.5 (0–0.86) |
| Recommendation accepted | — | 1.0 | 0.92 (0.91–1) | 0.82 (0.71–0.91) | 1.0 (0.75–1) |
| Core decisions settled | 0.33 (0–0.67) | 1.0 (0.67–1) | 1.0 (0.67–1) | 0.67 (0.67–1) | 0.67 (0.67–1) |
| Depth decisions settled | 0 | 0.6 (0.4–0.8) | 0.6 (0.6–0.8) | 0.4 (0.4–0.6) | 0.6 |
| Closure | 0.13 (0–0.25) | 0.75 (0.5–0.88) | 0.75 (0.75–0.88) | 0.63 (0.5–0.63) | 0.63 (0.63–0.75) |
| Silently assumed | 7 (6–8) | 2 (1–4) | 2 (1–2) | 3 (3–4) | 3 (2–3) |
| Settled from the repository, no question | 1 (0–2) | 0 (0–1) | 0 | 0 | 0 |
| Forbidden asked | 0 | 0 | 0 | 0 (0–1) | 0 (0–1) |
| Settled decisions kept in the code | 1.0 (0.5–1) | 1.0 | 1.0 (0.83–1) | 1.0 (0.8–1) | 1.0 (0.8–1) |
| Path declared correctly | 0/5 | 5/5 | 5/5 | 0/5 | 4/5 |
| Tokens | 171k (124k–233k) | 457k (365k–589k) | 682k (500k–1,329k) | 624k (447k–796k) | 293k (242k–452k) |
| Seconds | 74 (58–173) | 350 (228–440) | 426 (304–773) | 351 (281–546) | 194 (110–331) |

Runs in which each material decision was silently assumed:

| Decision (tier) | no skill | settle (native) | settle (text) | grilling | brainstorming |
| --- | ---: | ---: | ---: | ---: | ---: |
| collision-policy (core) | 3/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| atomicity (core) | 1/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| self-inclusion (core) | 5/5 | 2/5 | 1/5 | 3/5 | 3/5 |
| transient-collision (depth) | 5/5 | 0/5 | 0/5 | 1/5 | 2/5 |
| idempotency (depth) | 5/5 | 2/5 | 0/5 | 5/5 | 0/5 |
| case-insensitive-fs (depth) | 5/5 | 5/5 | 5/5 | 4/5 | 3/5 |
| failure-reporting (depth) | 5/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| preview-mode (depth) | 5/5 | 2/5 | 3/5 | 4/5 | 5/5 |

Forbidden questions asked: grilling re-asked the stdout/stderr convention in
1 of 5 runs; brainstorming re-opened the repository's no-undo decision in 1 of
5 runs.

Acceptance, as judged from the resulting file changes:

| Statement | no skill | settle (native) | settle (text) | grilling | brainstorming |
| --- | ---: | ---: | ---: | ---: | ---: |
| must achieve: a run that cannot complete leaves every file unchanged | 0/5 | 0/5 | 1/5 | 2/5 | 3/5 |
| must achieve: no existing file is ever overwritten | 3/5 | 2/5 | 2/5 | 1/5 | 5/5 |
| must preserve: no new runtime dependencies | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| must preserve: single-directory, non-recursive behavior | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| must preserve: stdout for output, stderr for diagnostics | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |

The judge's notes give the same reason for every arm that fell short: an
exists-then-rename sequence that can still overwrite a target created in
between, and a rollback that is explicitly best-effort. See the limitations
below on how the judge reads acceptance.

## Reading

**What the data supports.** The control is the clearest result: on both
tasks, in every run, an agent with no skill asked nothing, decided almost
everything by itself, and produced plausible code. Among the skills, settle's
distinguishing property is not how many decisions it closes but how it asks:
its questions carry repository evidence (1.0 on both tasks against 0.3 and
0.0 for grilling), its options differ in one respect (0.71 and 1.0), it sizes
the work correctly before asking, and it never asked what the repository
already answers. It does this in four native forms per task, the fewest
keyboard interactions of the three skills after brainstorming, and with
roughly 30% fewer tokens than grilling.

**Where the skills differ.** grilling closes as many decisions as settle on
`stale-exports` and fewer on `bulk-rename`, and buys that with roughly twice
the questions; one `bulk-rename` run and one `stale-exports` run re-asked
something the repository settles. brainstorming is the cheapest
skill and the shallowest: it settles the core decisions and leaves two to
four of the depth decisions to the agent.

**The native form itself is not the lever.** settle's text variant, the same
skill with prose questions, closed as many or more decisions (1.0 and 0.75)
at the cost of more questions, more chat replies (5 and 7 against 4), and on
`bulk-rename` more tokens. What the native channel buys is fewer keyboard
interactions and a tighter question budget, not more closure.

**What no skill fixes.** `case-insensitive-fs` was assumed silently in 17 of
the 20 skill runs and `preview-mode` in 14 of 20; these are decisions the
agents never consider rather than consider and skip. On `bulk-rename` both
absolute acceptance statements were met together in at most three runs of
any arm (brainstorming) and in no settle run; a settled decision about
atomicity did not produce atomic code. On `stale-exports`,
settle's one recurring gap is `change-detection`: when the user chose an
uncached ad hoc path, the agent treated the detection question as moot and the
judge did not.

## Limitations

- **Model-judged.** Decision dispositions, question quality, and acceptance
  are read by a model from the transcript and the diff, with the rubric as
  its only reference. The judge never sees which arm produced a run, but a
  prose transcript and a native-form transcript are recognizable. Acceptance
  is judged from the diff, not from executed tests, and it is the least
  reliable table: in one brainstorming run the agent stopped at a design and
  implemented nothing, yet its design was credited with the safety
  statements.
- **Author-written scenarios.** The fixtures, personas, and rubrics were
  written by Groundwork's author. The depth tier of each rubric was derived
  from what a deep interrogation surfaced on that scenario, so if the rubric
  favors anyone it favors interrogation-style skills.
- **Five runs per arm.** Closure moves in steps of one decision (0.11 and
  0.125), and the ranges overlap; a difference of one decision between two
  arms is within noise. The `no skill` gap and the evidence-rate gap are not.
- **One model.** settle's text was iterated against this model's behavior
  during August and September 2026; the rival skills were not tuned for it.
  The GPT-6 family was available at the time of the run and was not measured.
- **Rivals without their ecosystems.** grilling could not dispatch sub-agents
  and brainstorming ran without superpowers' other skills and hooks. Both were
  given the whole skill file and nothing else, which is how settle's text
  variant runs too.
- **Text adapter.** settle's text variant swaps its native question section for
  a text protocol written by Groundwork's author.
- **Simulated user.** The persona answers tersely and picks offered labels
  when one fits; a human might volunteer more or refuse a recommendation more
  often.
- **Sandbox.** The Windows unelevated sandbox blocks the child processes that
  `node --test` spawns (`spawn EPERM`), so agents on every arm ran test files
  directly with `node`; `rg` was unavailable and agents used PowerShell
  equivalents. This affected all arms alike.
- **Token totals.** Codex 0.158 reports the running thread total on every
  resumed turn of a text session. The harness that recorded these runs summed
  those reports; the text-channel totals above and the published run files
  were recomputed as per-turn differences afterwards, which is what the
  harness records now. Native totals are per-turn deltas of the app-server's
  running total and needed no correction. All totals include cached input
  tokens.

## Changes since the 3 September comparison

The earlier comparison used the skill text of 3 September, three repeats, and
brainstorming 6.3.0, with rival and settle arms measured on different days.
Against it, settle's closure moved from 0.78 to 0.89 on `stale-exports` and
from 0.63 to 0.75 on `bulk-rename` at roughly 1.5 times the tokens (309k and
319k then; 500k and 457k now). grilling moved from 0.78 to 1.0 and from 0.75
to 0.63. brainstorming 6.4.2 closed more than 6.3.0 on `stale-exports` (0.78
against 0.56). The earlier claim that settle used half of grilling's tokens no
longer holds; grilling now uses about 40% more tokens than settle.

## Reproducing

The judge output, question payloads, final messages, and diffs of every run
are under `eval/published/2026-09-30/stale-exports/` and
`eval/published/2026-09-30/bulk-rename/` in the harness's standard layout
(`<arm>/run-<k>/`), with a `manifest.json` per scenario that records the
model, the CLI version, and a hash of every arm's instruction text, and a
`summary.md` rendered from them. Event streams and stderr stayed local.

```sh
npm run eval:compare -- --scenario stale-exports --arms no-skill,settle,settle-text,grilling,superpowers-brainstorming --rounds 5
npm run eval:compare -- --scenario bulk-rename --arms no-skill,settle,settle-text,grilling,superpowers-brainstorming --rounds 5
npm run eval:summary -- eval/published/2026-09-30/stale-exports eval/published/2026-09-30/bulk-rename
```

`eval:compare` measures arms in rotated rounds, which is how these runs were
scheduled; `eval:summary` renders the tables above from the published files.
The rival arms resolve from the pinned commits in `eval/arms.json`.

## Harness changes made after this run

1. Text arms started `codex exec` in the operator's Codex home, so they saw
   every skill installed under `~/.codex/skills`, while native arms used a
   home holding only the sign-in file; `--ignore-user-config` does not hide
   skills. This run isolated every arm by pointing `CODEX_HOME` at such a
   directory before starting the harness. The runner now does this itself for
   text arms, the simulated user, and the judge.
2. On Codex 0.158, `codex exec resume` reports cumulative thread usage in
   `turn.completed`, so summing per-turn usage inflated text-arm totals two to
   three times. The runner now records each report and the turn's share of it;
   the published files were re-scored the same way.

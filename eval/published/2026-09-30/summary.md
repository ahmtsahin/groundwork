# Comparison results

Harness commit `fb7422c`. Schedule: round-robin: one repeat of every arm per round, order rotated each round.

Instruction sources:

- **no skill (Codex only)** (text channel, 0 chars): the task alone, no instructions
- **settle (native)** (native channel, 16772 chars): plugin/skills/settle/SKILL.md
- **settle (text)** (text channel, 15555 chars): plugin/skills/settle/SKILL.md with ## Native question tool from eval/hosts/text/native-question-tool.md
- **grilling (mattpocock)** (text channel, 2054 chars): mattpocock/skills@d81f3a1 (main, 2026-09-29); skill file last changed 85f83d3 (2026-08-20)
- **brainstorming (obra/superpowers)** (text channel, 17537 chars): obra/superpowers v6.4.2 (8ca22db, 2026-09-25); skill file last changed in v6.4.1

## stale-exports

Model `gpt-5.6-sol` for the agent, the simulated user, and the judge; codex-cli 0.158.0-alpha.2.1.
Median (range) over 5 no-skill, 5 settle, 5 settle-text, 5 grilling, 5 superpowers-brainstorming runs.

| Metric | no skill (Codex only) | settle (native) | settle (text) | grilling (mattpocock) | brainstorming (obra/superpowers) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Decision questions asked | 0 | 6 (4–7) | 8 (4–13) | 12 (6–19) | 1 (1–2) |
| Human inputs (forms answered + chat replies) | 0 | 4 (4–5) | 5 (4–7) | 5 (5–8) | 2 (2–3) |
| Questions citing repository evidence | — | 1 (0.86–1) | 0.8 (0.61–1) | 0.3 (0–0.5) | 1 (0–1) |
| Single-axis questions | — | 0.71 (0.5–0.83) | 0.75 (0.29–0.92) | 0.67 (0.5–0.8) | 0 (0–0.5) |
| Recommendation accepted | — | 0.75 (0.43–0.83) | 0.77 (0.75–1) | 0.84 (0.67–1) | 1 |
| Core decisions settled | 0.25 | 1 | 1 (0.75–1) | 1 (0.75–1) | 1 |
| Depth decisions settled | 0 | 0.8 (0.8–1) | 1 (0.8–1) | 1 (0.8–1) | 0.6 (0.2–0.8) |
| All decisions settled (closure) | 0.11 | 0.89 (0.89–1) | 1 (0.89–1) | 1 (0.89–1) | 0.78 (0.56–0.89) |
| Decisions silently assumed | 8 | 1 (0–1) | 0 (0–1) | 0 (0–1) | 2 (1–4) |
| Settled from the repository, no question | 1 | 0 (0–2) | 0 (0–3) | 0 | 1 (0–1) |
| Questions the repository already answered | 0 | 0 | 0 | 0 (0–1) | 0 |
| Settled decisions kept in the code | 1 | 1 | 1 (0.89–1) | 1 | 1 |
| Path declared correctly | 0 | 1 | 1 | 0 | 0 (0–1) |
| Tokens (thread total, cached input included) | 188k (144k–243k) | 500k (474k–546k) | 432k (325k–507k) | 690k (354k–1051k) | 340k (272k–371k) |
| Seconds | 95 (67–132) | 301 (283–364) | 301 (200–368) | 441 (331–571) | 141 (122–220) |

Runs in which each material decision was silently assumed:

| Decision (tier) | no skill (Codex only) | settle (native) | settle (text) | grilling (mattpocock) | brainstorming (obra/superpowers) |
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

Runs that asked a question the repository already answers:

| Forbidden question | no skill (Codex only) | settle (native) | settle (text) | grilling (mattpocock) | brainstorming (obra/superpowers) |
| --- | ---: | ---: | ---: | ---: | ---: |
| column-order | 0/5 | 0/5 | 0/5 | 1/5 | 0/5 |

Runs whose final work satisfied each acceptance statement, as the judge read the diff:

| Acceptance | no skill (Codex only) | settle (native) | settle (text) | grilling (mattpocock) | brainstorming (obra/superpowers) |
| --- | ---: | ---: | ---: | ---: | ---: |
| must achieve: an ad hoc export can produce data newer than the six hour TTL | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| must preserve: CSV header stays id,placedAt,total,status | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| must preserve: no new runtime dependencies | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| must preserve: nightly batch can still use cached rows | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |

## bulk-rename

Model `gpt-5.6-sol` for the agent, the simulated user, and the judge; codex-cli 0.158.0-alpha.2.1.
Median (range) over 5 no-skill, 5 settle, 5 settle-text, 5 grilling, 5 superpowers-brainstorming runs.

| Metric | no skill (Codex only) | settle (native) | settle (text) | grilling (mattpocock) | brainstorming (obra/superpowers) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Decision questions asked | 0 | 7 (5–9) | 12 (7–21) | 11 (9–19) | 2 (1–7) |
| Human inputs (forms answered + chat replies) | 0 | 4 (3–5) | 7 (5–11) | 6 (4–7) | 3 (2–12) |
| Questions citing repository evidence | — | 1 (0.8–1) | 0.54 (0.43–1) | 0 (0–0.16) | 0 (0–0.29) |
| Single-axis questions | — | 1 (0.57–1) | 0.91 (0.63–1) | 0.82 (0.67–0.86) | 0.5 (0–0.86) |
| Recommendation accepted | — | 1 | 0.92 (0.91–1) | 0.82 (0.71–0.91) | 1 (0.75–1) |
| Core decisions settled | 0.33 (0–0.67) | 1 (0.67–1) | 1 (0.67–1) | 0.67 (0.67–1) | 0.67 (0.67–1) |
| Depth decisions settled | 0 | 0.6 (0.4–0.8) | 0.6 (0.6–0.8) | 0.4 (0.4–0.6) | 0.6 |
| All decisions settled (closure) | 0.13 (0–0.25) | 0.75 (0.5–0.88) | 0.75 (0.75–0.88) | 0.63 (0.5–0.63) | 0.63 (0.63–0.75) |
| Decisions silently assumed | 7 (6–8) | 2 (1–4) | 2 (1–2) | 3 (3–4) | 3 (2–3) |
| Settled from the repository, no question | 1 (0–2) | 0 (0–1) | 0 | 0 | 0 |
| Questions the repository already answered | 0 | 0 | 0 | 0 (0–1) | 0 (0–1) |
| Settled decisions kept in the code | 1 (0.5–1) | 1 | 1 (0.83–1) | 1 (0.8–1) | 1 (0.8–1) |
| Path declared correctly | 0 | 1 | 1 | 0 | 1 (0–1) |
| Tokens (thread total, cached input included) | 171k (124k–233k) | 457k (365k–589k) | 682k (500k–1329k) | 624k (447k–796k) | 293k (242k–452k) |
| Seconds | 74 (58–173) | 350 (228–440) | 426 (304–773) | 351 (281–546) | 194 (110–331) |

Runs in which each material decision was silently assumed:

| Decision (tier) | no skill (Codex only) | settle (native) | settle (text) | grilling (mattpocock) | brainstorming (obra/superpowers) |
| --- | ---: | ---: | ---: | ---: | ---: |
| collision-policy (core) | 3/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| atomicity (core) | 1/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| self-inclusion (core) | 5/5 | 2/5 | 1/5 | 3/5 | 3/5 |
| transient-collision (depth) | 5/5 | 0/5 | 0/5 | 1/5 | 2/5 |
| idempotency (depth) | 5/5 | 2/5 | 0/5 | 5/5 | 0/5 |
| case-insensitive-fs (depth) | 5/5 | 5/5 | 5/5 | 4/5 | 3/5 |
| failure-reporting (depth) | 5/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| preview-mode (depth) | 5/5 | 2/5 | 3/5 | 4/5 | 5/5 |

Runs that asked a question the repository already answers:

| Forbidden question | no skill (Codex only) | settle (native) | settle (text) | grilling (mattpocock) | brainstorming (obra/superpowers) |
| --- | ---: | ---: | ---: | ---: | ---: |
| undo-feature | 0/5 | 0/5 | 0/5 | 0/5 | 1/5 |
| stream-convention | 0/5 | 0/5 | 0/5 | 1/5 | 0/5 |

Runs whose final work satisfied each acceptance statement, as the judge read the diff:

| Acceptance | no skill (Codex only) | settle (native) | settle (text) | grilling (mattpocock) | brainstorming (obra/superpowers) |
| --- | ---: | ---: | ---: | ---: | ---: |
| must achieve: a run that cannot complete leaves every file unchanged | 0/5 | 0/5 | 1/5 | 2/5 | 3/5 |
| must achieve: no existing file is ever overwritten | 3/5 | 2/5 | 2/5 | 1/5 | 5/5 |
| must preserve: no new runtime dependencies | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| must preserve: single-directory, non-recursive behavior | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| must preserve: user-facing output on stdout and diagnostics on stderr | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |

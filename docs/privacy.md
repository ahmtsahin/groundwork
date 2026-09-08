# Privacy

Groundwork is a set of instructions loaded by your coding agent. It runs no
service, has no server, and collects no data.

- The plugin contains Markdown, JSON, and YAML only. It ships no executable
  code and makes no network requests of its own.
- Everything the skill reads (your repository) and writes (code changes and
  decision records under `docs/decisions/`) stays in your working copy.
- Your requests and answers go only to the model and tools of the host you
  are using, under that host's own privacy terms: Codex (OpenAI) or Claude
  Code (Anthropic).
- The optional evaluation harness in this repository runs locally and writes
  its results to `eval/results/`, which is excluded from version control.

Questions: open a thread in
[Discussions](https://github.com/ahmtsahin/groundwork/discussions).

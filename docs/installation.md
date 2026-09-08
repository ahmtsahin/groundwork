# Installation

Groundwork is one plugin that Codex and Claude Code both load from the
repository's `plugin/` folder. Install it in each host you use. The plugin contains
instructions and metadata; installing it does not require Node.js, Python, an
API key, or a running service. The optional skills CLI path below uses Node.js.

## From a local checkout

Download the repository ZIP and extract it, or clone the repository. Open a
terminal in the repository root, where `README.md` and `.claude-plugin/`
live. Keep this folder if you install it as a local marketplace, because it
is the source used for later updates.

### Codex

Use a Codex CLI with `plugin` commands and the
`default_mode_request_user_input` feature. These commands were checked with
Codex CLI 0.153.0.

```sh
codex features enable default_mode_request_user_input
codex plugin marketplace add .
codex plugin add groundwork@groundwork
```

Open your project and start a new Codex task in **Default mode**:

```text
$settle Fix exports that sometimes return old data.
```

For the Codex app, run the installation commands on the same machine and with
the same Codex profile. If you use `CODEX_HOME`, it must point to the profile
used by the app. Start a new task after installation; an existing task may
keep the previously loaded skills.

Groundwork uses Codex's native `request_user_input` tool. The feature flag
enables this tool in Default mode. If your build does not recognize the flag
or `codex plugin`, update Codex before installing. The tool must also be
available in the task's host environment.

### Claude Code

These commands were checked with Claude Code 2.1.259:

```sh
claude plugin marketplace add .
claude plugin install groundwork@groundwork
```

Start a new Claude Code session in your project:

```text
/groundwork:settle Fix exports that sometimes return old data.
```

You can also use the equivalent commands inside Claude Code, from the
Groundwork checkout:

```text
/plugin marketplace add .
/plugin install groundwork@groundwork
```

The default installation scope is your user account. Groundwork uses the
built-in `AskUserQuestion` tool. See the
[Claude Code plugin guide](https://code.claude.com/docs/en/discover-plugins)
for host installation scopes and plugin management.

## Directly from GitHub

Install from [ahmtsahin/groundwork](https://github.com/ahmtsahin/groundwork).
No local clone is needed.

Codex, in a terminal:

```sh
codex features enable default_mode_request_user_input
codex plugin marketplace add ahmtsahin/groundwork
codex plugin add groundwork@groundwork
```

Claude Code, in a terminal:

```sh
claude plugin marketplace add ahmtsahin/groundwork
claude plugin install groundwork@groundwork
```

The marketplace and plugin are both named `groundwork`. Start a new task or
session after installation.

### Skills CLI

The [`skills` CLI](https://skills.sh/ahmtsahin/groundwork/settle) copies the
skill into the current project without either plugin system. It needs Node.js
and works for Codex, Claude Code, and other agents that read `SKILL.md` files:

```sh
npx skills add ahmtsahin/groundwork
```

Select the agents you use when asked. Codex still needs the
`default_mode_request_user_input` feature and invokes `$settle`; Claude Code
invokes `/settle` instead of `/groundwork:settle`. Add `--global` to install
for every project instead of the current one.

## Verify the installation

Use `codex plugin list` or `claude plugin list` to confirm Groundwork is
installed. In a new task, invoke the skill with a request containing a real
product decision. After inspecting the repository, it should show a native
question form with options and a free-form answer control.

A bare `$settle`, `/groundwork:settle`, or `/settle` for a skills CLI
install should start discovery, inspect the repository, and reach a native
question.

## Update

For a **GitHub installation**, refresh the marketplace and install the update.

Codex:

```sh
codex plugin marketplace upgrade groundwork
codex plugin add groundwork@groundwork
```

Claude Code:

```sh
claude plugin marketplace update groundwork
claude plugin update groundwork@groundwork
```

For a **local installation**, first update the checkout with
`git pull --ff-only` or extract the new download into the same location.
Then run `codex plugin add groundwork@groundwork`, or the two Claude Code
update commands above. Use a new task or session to pick up the update.

For a **skills CLI installation**, run `npx skills update settle` in the
project, or add `--global` for a global installation.

## Uninstall

Codex:

```sh
codex plugin remove groundwork@groundwork
```

Claude Code:

```sh
claude plugin uninstall groundwork@groundwork
```

Skills CLI:

```sh
npx skills remove settle
```

To remove the catalog as well, run `codex plugin marketplace remove groundwork`
or `claude plugin marketplace remove groundwork`. Uninstalling does not remove
decision records written in your projects.

## Troubleshooting

| Symptom | What to check |
|---|---|
| Plugin command or feature flag is unknown | Update the host CLI; run `codex plugin --help` or `claude plugin --help`. |
| Marketplace or plugin is missing | Add the repository root, then install `groundwork@groundwork`. A skill subfolder is not a marketplace. |
| Skill is missing in an existing task | Start a new task or session. On Codex, check that the CLI and app use the same `CODEX_HOME`. |
| Codex has no native question form | Enable `default_mode_request_user_input`, use Default mode, and start a new task. The host must expose `request_user_input`. |
| A question was dismissed | Invoke the skill again and explicitly supply or reopen the missing decision. A dismissal is not confirmation. |
| Local changes do not appear | Rebuild if you changed the shared skill, refresh the installation, and use a new session. For a published update, keep the release versions in sync. |

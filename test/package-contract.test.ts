import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "..");
const pluginRoot = path.join(repositoryRoot, "plugin");
const skillDirectory = path.join(pluginRoot, "skills", "settle");
const skillFile = path.join(skillDirectory, "SKILL.md");

const EXPECTED_VERSION = "0.5.0";

// The skill carries these sections in this order. The eval harness swaps the
// host section by heading to build its text baseline, so the order is a
// contract, not a style choice.
const SECTION_ORDER = [
  "## Bare invocation",
  "## Ground yourself first",
  "## Size the work",
  "## Compare approaches",
  "## What is worth asking",
  "## How to ask",
  "## Native question tool",
  "## Processing answers",
  "## Then build it",
  "## Language"
];

const HOST_SECTION = "## Native question tool";

const DECISION_CLASSES = [
  "Scope edge",
  "Edge behavior",
  "State shape and lifetime",
  "Contract and compatibility",
  "Trust and exposure",
  "Failure and recovery",
  "Seam placement"
];

async function readJson(absolutePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(absolutePath, "utf8")) as Record<string, unknown>;
}

async function readText(absolutePath: string): Promise<string> {
  return readFile(absolutePath, "utf8");
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolute = path.join(current, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, absolute)));
    } else {
      files.push(path.relative(root, absolute).replaceAll("\\", "/"));
    }
  }

  return files.sort();
}

/** Splits a skill into its level-two sections, in document order. */
function sections(markdown: string): Map<string, string> {
  const headings = [...markdown.matchAll(/^## .+$/gm)];
  const result = new Map<string, string>();

  headings.forEach((match, index) => {
    const start = match.index ?? 0;
    const next = headings[index + 1];
    const end = next?.index ?? markdown.length;
    result.set(match[0], markdown.slice(start, end).trim());
  });

  return result;
}

test("the plugin folder is a skill-only plugin for both hosts", async () => {
  const claude = await readJson(path.join(pluginRoot, ".claude-plugin", "plugin.json"));
  const codex = await readJson(path.join(pluginRoot, ".codex-plugin", "plugin.json"));

  assert.equal(claude.name, "groundwork");
  assert.equal(codex.name, "groundwork");
  assert.equal(claude.license, "MIT");
  assert.equal(codex.license, "MIT");
  assert.equal(codex.description, claude.description);
  assert.equal(codex.skills, "./skills/");
  assert.equal((codex.interface as { brandColor: string }).brandColor, "#4F46E5");
  assert.deepEqual(Object.keys(claude).sort(), [
    "author",
    "description",
    "keywords",
    "license",
    "name",
    "version"
  ]);

  // Hosts copy the plugin folder as a whole, so it holds manifests, the
  // skill, and its metadata, and nothing executable.
  assert.deepEqual((await readdir(pluginRoot)).sort(), [".claude-plugin", ".codex-plugin", "skills"]);
  assert.deepEqual(await listFiles(skillDirectory), ["SKILL.md", "agents/openai.yaml"]);
  for (const file of await listFiles(pluginRoot)) {
    assert.match(path.extname(file), /^\.(json|md|yaml)$/, `unexpected plugin content: ${file}`);
  }
});

test("the repository declares no plugin runtime dependencies or install-time scripts", async () => {
  const packageJson = await readJson(path.join(repositoryRoot, "package.json"));
  const devDependencies = packageJson.devDependencies as Record<string, string>;
  const scripts = packageJson.scripts as Record<string, string>;

  assert.equal(packageJson.version, EXPECTED_VERSION);
  assert.equal(packageJson.dependencies, undefined);
  assert.deepEqual(Object.keys(devDependencies).sort(), [
    "@types/node",
    "tsx",
    "typescript"
  ]);
  assert.equal(scripts.build, undefined, "the plugin has no build step");
  for (const hook of ["preinstall", "install", "postinstall", "prepare", "prepublish"]) {
    assert.equal(scripts[hook], undefined, `${hook} would run on install`);
  }
  for (const filename of ["package.json", "package-lock.json"]) {
    await assert.rejects(access(path.join(pluginRoot, filename)), /ENOENT/);
  }
});

test("every manifest agrees on the package version", async () => {
  const claude = await readJson(path.join(pluginRoot, ".claude-plugin", "plugin.json"));
  const codex = await readJson(path.join(pluginRoot, ".codex-plugin", "plugin.json"));
  const marketplace = await readJson(path.join(repositoryRoot, ".claude-plugin", "marketplace.json"));
  const lock = await readJson(path.join(repositoryRoot, "package-lock.json"));
  const listed = (marketplace.plugins as Array<{ version: string }>)[0];
  const lockRoot = (lock.packages as Record<string, { version: string }>)[""];

  assert.equal(claude.version, EXPECTED_VERSION);
  assert.equal(codex.version, EXPECTED_VERSION);
  assert.equal(listed.version, EXPECTED_VERSION);
  assert.equal(lock.version, EXPECTED_VERSION);
  assert.equal(lockRoot.version, EXPECTED_VERSION);
});

test("both marketplaces live at the repository root and point at the plugin folder", async () => {
  const claudeMarketplace = await readJson(
    path.join(repositoryRoot, ".claude-plugin", "marketplace.json")
  );
  const codexMarketplace = await readJson(
    path.join(repositoryRoot, ".agents", "plugins", "marketplace.json")
  );

  const claudeEntry = (claudeMarketplace.plugins as Array<{ name: string; source: string }>)[0];
  assert.equal(claudeMarketplace.name, "groundwork");
  assert.equal(claudeEntry.name, "groundwork");
  assert.equal(path.resolve(repositoryRoot, claudeEntry.source), pluginRoot);

  const codexEntry = (
    codexMarketplace.plugins as Array<{ name: string; source: { source: string; path: string } }>
  )[0];
  assert.equal(codexMarketplace.name, "groundwork");
  assert.equal(codexEntry.name, "groundwork");
  assert.equal(codexEntry.source.source, "local");
  assert.equal(path.resolve(repositoryRoot, codexEntry.source.path), pluginRoot);

  await access(path.join(pluginRoot, ".claude-plugin", "plugin.json"));
  await access(path.join(pluginRoot, ".codex-plugin", "plugin.json"));
});

test("the skill keeps its section order and names host question tools only in the host section", async () => {
  const skill = await readText(skillFile);
  const table = sections(skill);

  assert.match(skill, /^name: settle$/m);
  assert.deepEqual([...table.keys()], SECTION_ORDER);

  const host = table.get(HOST_SECTION) ?? "";
  assert.match(host, /AskUserQuestion/);
  assert.match(host, /request_user_input/);
  assert.match(host, /default_mode_request_user_input/);

  // Everything outside the host section reads the same on every host.
  for (const [heading, text] of table) {
    if (heading !== HOST_SECTION) {
      assert.doesNotMatch(text, /AskUserQuestion|request_user_input/, heading);
    }
  }
});

test("the decision classes survive in the skill", async () => {
  const probes = sections(await readText(skillFile)).get("## What is worth asking") ?? "";

  for (const decisionClass of DECISION_CLASSES) {
    assert.ok(probes.includes(`| ${decisionClass} |`), `decision class missing: ${decisionClass}`);
  }
});

test("Codex skill metadata sits inside the skill folder", async () => {
  const metadata = await readText(path.join(skillDirectory, "agents", "openai.yaml"));

  assert.match(metadata, /display_name: "Settle"/);
  assert.match(metadata, /allow_implicit_invocation: false/);
});

test("every native Codex eval arm enables the Default-mode feature", async () => {
  const arms = await readJson(path.join(repositoryRoot, "eval", "arms.json"));
  const codexArms = (arms.arms as Array<{
    id: string;
    host?: string;
    channel: string;
    enableFeatures?: string[];
    sources: Array<{ kind: string; path?: string }>;
  }>).filter((arm) => (arm.host ?? "codex") === "codex");
  const nativeArms = codexArms.filter((arm) => arm.channel === "native");

  assert.ok(nativeArms.length >= 1);
  for (const arm of nativeArms) {
    assert.deepEqual(arm.enableFeatures, ["default_mode_request_user_input"]);
  }
  assert.deepEqual(nativeArms.find((arm) => arm.id === "settle")?.sources, [
    { kind: "repo", path: "plugin/skills/settle/SKILL.md" }
  ]);

  const textArms = codexArms.filter((arm) => arm.channel === "text");

  assert.ok(textArms.length >= 1);
  for (const arm of textArms) {
    assert.equal(
      arm.enableFeatures,
      undefined,
      `${arm.id} must not enable native input on the text channel`
    );
  }
  assert.deepEqual(textArms.find((arm) => arm.id === "no-skill")?.sources, []);

  for (const variant of ["compact", "interrogate"]) {
    const text = await readFile(
      path.join(repositoryRoot, "eval", "variants", variant, "SKILL.md"),
      "utf8"
    );
    assert.match(text, /request_user_input/);
    assert.match(text, /Default mode/i);
  }
});

test("Claude Code eval arms run the same skill file and never enable a Codex feature", async () => {
  const arms = await readJson(path.join(repositoryRoot, "eval", "arms.json"));
  const claudeArms = (arms.arms as Array<{
    id: string;
    host?: string;
    channel: string;
    enableFeatures?: string[];
    sources: Array<{ kind: string; path?: string }>;
  }>).filter((arm) => arm.host === "claude");

  assert.ok(claudeArms.length >= 1);
  for (const arm of claudeArms) {
    assert.equal(arm.enableFeatures, undefined, `${arm.id} must not carry Codex features`);
  }

  const settle = claudeArms.find((arm) => arm.id === "settle-claude");
  assert.ok(settle, "settle-claude arm must exist");
  assert.equal(settle.channel, "native");
  assert.deepEqual(settle.sources, [{ kind: "repo", path: "plugin/skills/settle/SKILL.md" }]);
  assert.deepEqual(claudeArms.find((arm) => arm.id === "no-skill-claude")?.sources, []);

  const claude = arms.claude as { defaultModel?: string; maxBudgetUsd?: number } | undefined;
  assert.equal(claude?.defaultModel, "opus");
  assert.ok((claude?.maxBudgetUsd ?? 0) > 0);
});

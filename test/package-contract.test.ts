import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "..");
const sharedPluginRoot = path.join(repositoryRoot, "plugins", "groundwork");
const codexPluginRoot = path.join(
  repositoryRoot,
  "codex",
  "plugins",
  "groundwork"
);
const codexHostRoot = path.join(repositoryRoot, "scripts", "hosts", "codex");
const sharedSkillDirectory = path.join(sharedPluginRoot, "skills", "settle");
const codexSkillDirectory = path.join(codexPluginRoot, "skills", "settle");

const EXPECTED_VERSION = "0.4.0";

// The shared body and every host build carry these sections in this order.
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

async function loadSkills() {
  const shared = await readText(path.join(sharedSkillDirectory, "SKILL.md"));
  const codex = await readText(path.join(codexSkillDirectory, "SKILL.md"));

  return {
    shared,
    codex,
    sharedSections: sections(shared),
    codexSections: sections(codex)
  };
}

test("the Codex package is skill-only", async () => {
  const manifest = await readJson(
    path.join(codexPluginRoot, ".codex-plugin", "plugin.json")
  );
  const entries = (await readdir(codexPluginRoot)).sort();
  const files = await listFiles(codexPluginRoot);

  assert.deepEqual(entries, [".codex-plugin", "skills"]);
  for (const file of files) {
    assert.match(
      path.extname(file),
      /^\.(json|md|yaml)$/,
      `Codex package ships executable or unexpected content: ${file}`
    );
  }

  assert.equal(manifest.name, "groundwork");
  assert.equal(manifest.version, EXPECTED_VERSION);
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.license, "MIT");
  assert.equal(
    (manifest.interface as { brandColor: string }).brandColor,
    "#4F46E5"
  );
});

test("the repository declares no plugin runtime dependencies", async () => {
  const packageJson = await readJson(path.join(repositoryRoot, "package.json"));
  const devDependencies = packageJson.devDependencies as Record<string, string>;

  assert.equal(packageJson.version, EXPECTED_VERSION);
  assert.equal(packageJson.dependencies, undefined);
  assert.deepEqual(Object.keys(devDependencies).sort(), [
    "@types/node",
    "tsx",
    "typescript"
  ]);
});

test("every manifest agrees on the package version", async () => {
  const shared = await readJson(
    path.join(sharedPluginRoot, ".claude-plugin", "plugin.json")
  );
  const marketplace = await readJson(
    path.join(repositoryRoot, ".claude-plugin", "marketplace.json")
  );
  const listed = (marketplace.plugins as Array<{ version: string }>)[0];

  assert.equal(shared.version, EXPECTED_VERSION);
  assert.equal(listed.version, EXPECTED_VERSION);
  assert.deepEqual(Object.keys(shared).sort(), [
    "author",
    "description",
    "keywords",
    "license",
    "name",
    "version"
  ]);
});

test("both marketplaces live at the repository root and point at their host package", async () => {
  const claudeMarketplace = await readJson(
    path.join(repositoryRoot, ".claude-plugin", "marketplace.json")
  );
  const codexMarketplace = await readJson(
    path.join(repositoryRoot, ".agents", "plugins", "marketplace.json")
  );

  const claudeEntry = (claudeMarketplace.plugins as Array<{ name: string; source: string }>)[0];
  assert.equal(claudeEntry.name, "groundwork");
  assert.equal(path.resolve(repositoryRoot, claudeEntry.source), sharedPluginRoot);

  const codexEntry = (
    codexMarketplace.plugins as Array<{ name: string; source: { source: string; path: string } }>
  )[0];
  assert.equal(codexMarketplace.name, "groundwork");
  assert.equal(codexEntry.name, "groundwork");
  assert.equal(codexEntry.source.source, "local");
  assert.equal(path.resolve(repositoryRoot, codexEntry.source.path), codexPluginRoot);
  await access(path.join(codexPluginRoot, ".codex-plugin", "plugin.json"));
});

test("both hosts share one skill body and differ only in the host question section", async () => {
  const { sharedSections, codexSections } = await loadSkills();

  assert.deepEqual([...sharedSections.keys()], SECTION_ORDER);
  assert.deepEqual([...codexSections.keys()], SECTION_ORDER);

  for (const heading of SECTION_ORDER) {
    if (heading === HOST_SECTION) {
      assert.notEqual(
        sharedSections.get(heading),
        codexSections.get(heading),
        "host question sections must differ between hosts"
      );
    } else {
      assert.equal(
        sharedSections.get(heading),
        codexSections.get(heading),
        `section drifted between hosts: ${heading}`
      );
    }
  }
});

test("each host section names only its own native question tool", async () => {
  const { shared, codex, sharedSections, codexSections } = await loadSkills();
  const partial = (
    await readText(path.join(codexHostRoot, "native-question-tool.md"))
  ).trim();

  assert.ok(sharedSections.get(HOST_SECTION)?.includes("AskUserQuestion"));
  assert.doesNotMatch(shared, /request_user_input/);

  assert.equal(codexSections.get(HOST_SECTION), partial);
  assert.ok(partial.includes("request_user_input"));
  assert.ok(partial.includes("default_mode_request_user_input"));
  assert.doesNotMatch(codex, /AskUserQuestion/);

  // The shared body outside the host section is host-neutral, so the bare
  // invocation contract reads the same on every host.
  for (const [heading, text] of sharedSections) {
    if (heading !== HOST_SECTION) {
      assert.doesNotMatch(text, /AskUserQuestion|request_user_input/, heading);
    }
  }
});

test("the decision classes survive in both packages", async () => {
  const { sharedSections, codexSections } = await loadSkills();

  for (const table of [sharedSections, codexSections]) {
    const probes = table.get("## What is worth asking") ?? "";

    for (const decisionClass of DECISION_CLASSES) {
      assert.ok(
        probes.includes(`| ${decisionClass} |`),
        `decision class missing: ${decisionClass}`
      );
    }
  }
});

test("Codex skill metadata ships only in the Codex package", async () => {
  const source = await readText(path.join(codexHostRoot, "agents", "openai.yaml"));
  const built = await readText(path.join(codexSkillDirectory, "agents", "openai.yaml"));

  assert.equal(built, source);
  await assert.rejects(
    access(path.join(sharedSkillDirectory, "agents", "openai.yaml")),
    /ENOENT/
  );
});

test("every native Codex eval arm enables the Default-mode feature", async () => {
  const arms = await readJson(path.join(repositoryRoot, "eval", "arms.json"));
  const codexArms = (arms.arms as Array<{
    id: string;
    host?: string;
    channel: string;
    enableFeatures?: string[];
    sources: unknown[];
  }>).filter((arm) => (arm.host ?? "codex") === "codex");
  const nativeArms = codexArms.filter((arm) => arm.channel === "native");

  assert.ok(nativeArms.length >= 1);
  for (const arm of nativeArms) {
    assert.deepEqual(arm.enableFeatures, ["default_mode_request_user_input"]);
  }

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

test("Claude Code eval arms run the Claude package and never enable a Codex feature", async () => {
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
  assert.deepEqual(settle.sources, [
    { kind: "repo", path: "plugins/groundwork/skills/settle/SKILL.md" }
  ]);
  assert.deepEqual(claudeArms.find((arm) => arm.id === "no-skill-claude")?.sources, []);

  const claude = arms.claude as { defaultModel?: string; maxBudgetUsd?: number } | undefined;
  assert.equal(claude?.defaultModel, "opus");
  assert.ok((claude?.maxBudgetUsd ?? 0) > 0);
});

test("host package roots do not trigger install-time dependency resolution", async () => {
  for (const pluginRoot of [sharedPluginRoot, codexPluginRoot]) {
    for (const filename of ["package.json", "package-lock.json"]) {
      await assert.rejects(access(path.join(pluginRoot, filename)), /ENOENT/);
    }
  }

  await assert.doesNotReject(access(path.join(repositoryRoot, "package.json")));
  await assert.doesNotReject(access(path.join(repositoryRoot, "package-lock.json")));
});

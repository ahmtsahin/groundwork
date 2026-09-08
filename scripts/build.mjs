import { cp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { replaceSection } from "./lib/skill-sections.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const sharedPluginRoot = path.join(repositoryRoot, "plugins", "groundwork");
const codexHostRoot = path.join(scriptDirectory, "hosts", "codex");
const codexPluginRoot = path.join(
  repositoryRoot,
  "codex",
  "plugins",
  "groundwork"
);
const codexSkillsDirectory = path.join(codexPluginRoot, "skills");
const codexSkillDirectory = path.join(codexSkillsDirectory, "settle");
const codexSkillFile = path.join(codexSkillDirectory, "SKILL.md");

const bareInvocationHeading = "## Bare invocation";
const nativeHeading = "## Native question tool";
const processingHeading = "## Processing answers";

const sharedManifest = JSON.parse(
  await readFile(path.join(sharedPluginRoot, ".claude-plugin", "plugin.json"), "utf8")
);
const codexInterface = JSON.parse(
  await readFile(path.join(codexHostRoot, "plugin-interface.json"), "utf8")
);

// The Codex build is a skill-only package: the shared skill with its host
// question section replaced by the Codex partial, plus Codex skill metadata.
// Everything host-specific lives under scripts/hosts/codex so the shared
// source stays the single place where decision logic is edited.
await rm(codexSkillsDirectory, { recursive: true, force: true });
await cp(path.join(sharedPluginRoot, "skills"), codexSkillsDirectory, {
  recursive: true
});
await cp(path.join(codexHostRoot, "agents"), path.join(codexSkillDirectory, "agents"), {
  recursive: true
});

const sharedSkill = await readFile(codexSkillFile, "utf8");
const codexNativeSection = (
  await readFile(path.join(codexHostRoot, "native-question-tool.md"), "utf8")
).trim();

for (const heading of [bareInvocationHeading, nativeHeading, processingHeading]) {
  if (!sharedSkill.includes(heading)) {
    throw new Error(`shared skill no longer has the "${heading}" section`);
  }
}

if (sharedSkill.indexOf(processingHeading) < sharedSkill.indexOf(nativeHeading)) {
  throw new Error("shared skill no longer has a replaceable native-tool section");
}

const hostSpecificSkill = replaceSection(sharedSkill, nativeHeading, codexNativeSection);

await writeFile(codexSkillFile, hostSpecificSkill.trimEnd() + "\n", "utf8");
await writeFile(
  path.join(codexPluginRoot, ".codex-plugin", "plugin.json"),
  JSON.stringify({ ...sharedManifest, skills: "./skills/", interface: codexInterface }, null, 2) + "\n",
  "utf8"
);

console.log(
  "Built the Codex skill-only package from the shared skill and scripts/hosts/codex."
);

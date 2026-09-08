#!/usr/bin/env node
import { applyRenames, planRenames } from "./rename.js";

const [, , directory, pattern, replacement] = process.argv;

if (!directory || !pattern || !replacement) {
  console.error("usage: renamer <dir> <pattern> <replacement>");
  process.exit(1);
}

const plan = planRenames(directory, pattern, replacement);

for (const step of plan) {
  process.stdout.write(`${step.from} -> ${step.to}\n`);
}

applyRenames(directory, plan);

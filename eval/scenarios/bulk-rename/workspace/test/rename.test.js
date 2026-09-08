import assert from "node:assert/strict";
import test from "node:test";

import { planRenames } from "../src/rename.js";

test("the plan numbers matches from one and pads to three digits", () => {
  const plan = planRenames("fixtures", "*.jpg", "photo-#.jpg");
  assert.deepEqual(plan.slice(0, 2), [
    { from: "a.jpg", to: "photo-001.jpg" },
    { from: "b.jpg", to: "photo-002.jpg" }
  ]);
});

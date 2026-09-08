import assert from "node:assert/strict";
import test from "node:test";

import { toCsv } from "../src/exporter.js";

test("toCsv keeps the 2.x column order that downstream Sheets imports depend on", () => {
  const csv = toCsv([{ id: "a1", placedAt: "2026-01-02", total: 10, status: "paid" }]);
  assert.equal(csv.split("\n")[0], "id,placedAt,total,status");
});

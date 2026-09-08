#!/usr/bin/env node
import { exportOrders, toCsv } from "./exporter.js";

const [, , from, to] = process.argv;

if (!from || !to) {
  console.error("usage: reportkit <from> <to>");
  process.exit(1);
}

process.stdout.write(toCsv(exportOrders(from, to)));

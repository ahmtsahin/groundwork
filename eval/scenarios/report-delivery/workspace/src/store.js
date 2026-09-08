import { readFileSync } from "node:fs";

// The upstream sync job rewrites data/orders.json roughly every 15 minutes.
export function loadOrders() {
  return JSON.parse(readFileSync("data/orders.json", "utf8"));
}

export function ordersForRange(from, to) {
  return loadOrders().filter((order) => order.placedAt >= from && order.placedAt <= to);
}

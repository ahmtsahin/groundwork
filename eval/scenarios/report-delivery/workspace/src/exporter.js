import { readCache, writeCache } from "./cache.js";
import { ordersForRange } from "./store.js";

function cacheKey(from, to) {
  return `orders-${from}-${to}`;
}

export function exportOrders(from, to) {
  const cached = readCache(cacheKey(from, to));
  if (cached) return cached;

  const rows = ordersForRange(from, to).map((order) => ({
    id: order.id,
    placedAt: order.placedAt,
    total: order.total,
    status: order.status
  }));

  writeCache(cacheKey(from, to), rows);
  return rows;
}

export function toCsv(rows) {
  const header = "id,placedAt,total,status";
  const body = rows.map((r) => `${r.id},${r.placedAt},${r.total},${r.status}`);
  return [header, ...body].join("\n");
}

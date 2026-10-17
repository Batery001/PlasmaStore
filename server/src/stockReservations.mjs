/**
 * Reservas de stock web (TTL) + canal de venta.
 * - stock físico = products.stock (caja usa esto directo)
 * - disponible web = stock − sum(reservas activas)
 * - caja puede romper reservas (prioridad física)
 */

export const RESERVATION_TTL_MS = 15 * 60 * 1000;

export const STOCK_GONE_MSG =
  "Este producto ya no está disponible (pudo venderse en tienda). Espera a que haya existencia nuevamente.";

/** @param {unknown} raw */
export function normalizeSalesChannel(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (v === "store_only" || v === "tienda" || v === "pos" || v === "fisica" || v === "física") return "store_only";
  return "both";
}

/** @param {{ sales_channel?: string } | null | undefined} product */
export function isWebSellable(product) {
  return normalizeSalesChannel(product?.sales_channel) === "both";
}

/**
 * Marca como expired las reservas vencidas.
 * @param {any} db
 */
export async function expireReservations(db) {
  const nowMs = Date.now();
  // Evita re-escanear en cada producto / request (TTL 15 min; 5s basta).
  if (nowMs - lastExpireAt < 5000) return;
  lastExpireAt = nowMs;
  const now = new Date(nowMs);
  const rows = await db
    .collection("stock_reservations")
    .find({ status: "active" })
    .project({ _id: 1, expiresAt: 1 })
    .toArray();
  for (const r of rows) {
    const exp = r.expiresAt instanceof Date ? r.expiresAt : new Date(r.expiresAt);
    if (!(exp instanceof Date) || Number.isNaN(exp.getTime()) || exp > now) continue;
    await db.collection("stock_reservations").updateOne(
      { _id: r._id, status: "active" },
      { $set: { status: "expired", updatedAt: now } }
    );
  }
}

let lastExpireAt = 0;

/**
 * Cantidad reservada activa para un producto (opcionalmente excluye una orden).
 * @param {any} db
 * @param {number} productId
 * @param {number | null} [excludeOrderId]
 */
export async function reservedQtyForProduct(db, productId, excludeOrderId = null) {
  await expireReservations(db);
  const filter = { status: "active", product_id: productId };
  const rows = await db.collection("stock_reservations").find(filter).project({ quantity: 1, order_id: 1 }).toArray();
  let sum = 0;
  for (const r of rows) {
    if (excludeOrderId != null && Number(r.order_id) === Number(excludeOrderId)) continue;
    const q = parseInt(String(r.quantity ?? 0), 10);
    if (Number.isFinite(q) && q > 0) sum += q;
  }
  return sum;
}

/**
 * Mapa product_id → cantidad reservada (una sola query).
 * @param {any} db
 * @param {number[]} productIds
 * @returns {Promise<Map<number, number>>}
 */
export async function reservedQtyMap(db, productIds) {
  await expireReservations(db);
  const map = new Map();
  const ids = [...new Set((productIds || []).map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return map;
  const rows = await db
    .collection("stock_reservations")
    .find({ status: "active", product_id: { $in: ids } })
    .project({ product_id: 1, quantity: 1 })
    .toArray();
  for (const r of rows) {
    const pid = parseInt(String(r.product_id), 10);
    const q = parseInt(String(r.quantity ?? 0), 10);
    if (!Number.isFinite(pid) || !Number.isFinite(q) || q < 1) continue;
    map.set(pid, (map.get(pid) || 0) + q);
  }
  return map;
}

/**
 * Stock disponible para la web.
 * @param {any} db
 * @param {{ _id?: number, stock?: number }} product
 * @param {number | null} [excludeOrderId]
 */
export async function availableForWeb(db, product, excludeOrderId = null) {
  const stock = parseInt(String(product?.stock ?? 0), 10) || 0;
  const pid = parseInt(String(product?._id ?? 0), 10);
  if (!Number.isFinite(pid) || pid < 1) return Math.max(0, stock);
  const reserved = await reservedQtyForProduct(db, pid, excludeOrderId);
  return Math.max(0, stock - reserved);
}

/**
 * Stock web usando un mapa precalculado (listados).
 * @param {{ _id?: number, stock?: number }} product
 * @param {Map<number, number>} reservedMap
 */
export function availableForWebFromMap(product, reservedMap) {
  const stock = parseInt(String(product?.stock ?? 0), 10) || 0;
  const pid = parseInt(String(product?._id ?? 0), 10);
  const reserved = Number.isFinite(pid) ? reservedMap.get(pid) || 0 : 0;
  return Math.max(0, stock - reserved);
}

/**
 * Libera reservas activas de una orden.
 * @param {any} db
 * @param {number} orderId
 * @param {string} [reason]
 */
export async function releaseReservationsForOrder(db, orderId, reason = "released") {
  const now = new Date();
  const rows = await db
    .collection("stock_reservations")
    .find({ order_id: orderId, status: "active" })
    .project({ _id: 1 })
    .toArray();
  for (const r of rows) {
    await db.collection("stock_reservations").updateOne(
      { _id: r._id, status: "active" },
      { $set: { status: reason, updatedAt: now } }
    );
  }
}

/**
 * Caja rompe reservas web de esos productos.
 * @param {any} db
 * @param {number[]} productIds
 */
export async function breakReservationsForProducts(db, productIds) {
  const now = new Date();
  const ids = [...new Set(productIds.map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n) && n > 0))];
  let broken = 0;
  for (const pid of ids) {
    const rows = await db
      .collection("stock_reservations")
      .find({ product_id: pid, status: "active" })
      .project({ _id: 1, order_id: 1 })
      .toArray();
    for (const r of rows) {
      const ok = await db.collection("stock_reservations").updateOne(
        { _id: r._id, status: "active" },
        { $set: { status: "broken_by_pos", updatedAt: now } }
      );
      if (ok?.modifiedCount) broken += 1;
      if (r.order_id != null) {
        await db.collection("store_orders").updateOne(
          { _id: r.order_id, status: "pending_payment" },
          {
            $set: {
              stock_conflict: true,
              stock_conflict_msg: STOCK_GONE_MSG,
              updatedAt: now,
            },
          }
        );
      }
    }
  }
  return broken;
}

/**
 * Crea reservas para una orden (tras validar disponibilidad).
 * @param {any} db
 * @param {{ orderId: number, userId: number, items: Array<{ product_id: number, quantity: number }> }} args
 */
export async function createReservationsForOrder(db, { orderId, userId, items }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);
  const idBase = Date.now();
  let i = 0;
  for (const it of items) {
    const pid = parseInt(String(it.product_id), 10);
    const qty = parseInt(String(it.quantity), 10);
    if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(qty) || qty < 1) continue;
    i += 1;
    await db.collection("stock_reservations").insertOne({
      _id: `${orderId}_${pid}_${idBase}_${i}`,
      order_id: orderId,
      user_id: userId,
      product_id: pid,
      quantity: qty,
      status: "active",
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { expiresAt, ttl_ms: RESERVATION_TTL_MS };
}

/**
 * Consume reservas de una orden pagada (sin tocar stock; el caller descuenta).
 * @param {any} db
 * @param {number} orderId
 */
export async function consumeReservationsForOrder(db, orderId) {
  const now = new Date();
  const rows = await db
    .collection("stock_reservations")
    .find({ order_id: orderId, status: "active" })
    .project({ _id: 1 })
    .toArray();
  for (const r of rows) {
    await db.collection("stock_reservations").updateOne(
      { _id: r._id, status: "active" },
      { $set: { status: "consumed", updatedAt: now } }
    );
  }
}

/**
 * ¿La orden aún tiene reserva válida para todos sus ítems?
 * @param {any} db
 * @param {{ _id: number, items?: any[] }} order
 */
export async function assertOrderReservationsOk(db, order) {
  await expireReservations(db);
  const orderId = order._id;
  const items = Array.isArray(order.items) ? order.items : [];
  const active = await db
    .collection("stock_reservations")
    .find({ order_id: orderId, status: "active" })
    .project({ product_id: 1, quantity: 1, expiresAt: 1 })
    .toArray();

  const byPid = new Map();
  for (const r of active) {
    const pid = parseInt(String(r.product_id), 10);
    const q = parseInt(String(r.quantity), 10) || 0;
    byPid.set(pid, (byPid.get(pid) || 0) + q);
  }

  for (const it of items) {
    const pid = parseInt(String(it?.product_id ?? 0), 10);
    const qty = parseInt(String(it?.quantity ?? 0), 10);
    if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(qty) || qty < 1) continue;
    const have = byPid.get(pid) || 0;
    if (have < qty) {
      return { ok: false, error: STOCK_GONE_MSG };
    }
  }
  return { ok: true };
}

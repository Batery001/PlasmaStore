/** Wishlist / aviso de stock. */
export const WISHLIST_COLL = "store_wishlist";

/**
 * @param {any} db
 * @param {number} userId
 * @param {number} productId
 * @param {string} [email]
 */
export async function addWishlist(db, userId, productId, email) {
  const now = new Date();
  await db.collection(WISHLIST_COLL).updateOne(
    { user_id: userId, product_id: productId },
    {
      $set: {
        user_id: userId,
        product_id: productId,
        email: String(email || "").trim().toLowerCase() || null,
        notify: true,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
}

/**
 * @param {any} db
 * @param {number} userId
 * @param {number} productId
 */
export async function removeWishlist(db, userId, productId) {
  await db.collection(WISHLIST_COLL).deleteOne({ user_id: userId, product_id: productId });
}

/**
 * @param {any} db
 * @param {number} userId
 */
export async function listWishlist(db, userId) {
  const rows = await db.collection(WISHLIST_COLL).find({ user_id: userId }).toArray();
  const ids = rows.map((r) => r.product_id).filter(Boolean);
  const products = ids.length
    ? await db
        .collection("products")
        .find({ _id: { $in: ids } })
        .project({ name: 1, price_cents: 1, stock: 1, image_url: 1, active: 1 })
        .toArray()
    : [];
  const byId = new Map(products.map((p) => [p._id, p]));
  return rows.map((r) => {
    const p = byId.get(r.product_id);
    return {
      product_id: r.product_id,
      notify: r.notify !== false,
      name: p?.name || `Producto #${r.product_id}`,
      price_cents: p?.price_cents ?? 0,
      stock: p?.stock ?? 0,
      image_url: p?.image_url || null,
      available: Boolean(p && p.active !== 0 && (p.stock || 0) > 0),
    };
  });
}

/** ¿Pasó de agotado a con stock? */
export function isRestockTransition(prevStock, nextStock) {
  const prev = Math.max(0, parseInt(String(prevStock ?? 0), 10) || 0);
  const next = Math.max(0, parseInt(String(nextStock ?? 0), 10) || 0);
  return prev <= 0 && next > 0;
}

/**
 * Suscriptores pendientes de aviso (notify !== false).
 * @param {any} db
 * @param {number} productId
 */
export async function findRestockSubscribers(db, productId) {
  const pid = parseInt(String(productId), 10);
  if (!Number.isFinite(pid) || pid < 1) return [];
  const rows = await db
    .collection(WISHLIST_COLL)
    .find({ product_id: pid, notify: { $ne: false } })
    .toArray();
  return rows
    .map((r) => ({
      user_id: r.user_id,
      email: String(r.email || "").trim().toLowerCase(),
    }))
    .filter((r) => r.email.includes("@"));
}

/**
 * Marca avisados para no reenviar hasta que vuelvan a pedir aviso.
 * @param {any} db
 * @param {number} productId
 * @param {number[]} [userIds]
 */
export async function markWishlistNotified(db, productId, userIds) {
  const pid = parseInt(String(productId), 10);
  if (!Number.isFinite(pid) || pid < 1) return;
  const filter = { product_id: pid, notify: { $ne: false } };
  if (Array.isArray(userIds) && userIds.length) {
    filter.user_id = { $in: userIds };
  }
  await db.collection(WISHLIST_COLL).updateMany(filter, {
    $set: { notify: false, notified_at: new Date(), updatedAt: new Date() },
  });
}

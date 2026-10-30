/**
 * Fusiona carrito de invitado (ps_guest) en el carrito del usuario al iniciar sesión.
 */
import { isEventProduct } from "./eventRegistrations.mjs";
import { availableForWeb, isWebSellable } from "./stockReservations.mjs";

/**
 * @param {any} db
 * @param {string | null | undefined} guestId
 * @param {number} userId
 * @returns {Promise<{ merged: number, skipped: number }>}
 */
export async function mergeGuestCartIntoUser(db, guestId, userId) {
  const gid = String(guestId || "").trim();
  if (!gid || !Number.isFinite(userId) || userId < 1) return { merged: 0, skipped: 0 };

  const guestItems = await db.collection("cart_items").find({ guest_id: gid }).toArray();
  if (!guestItems.length) return { merged: 0, skipped: 0 };

  let merged = 0;
  let skipped = 0;

  for (const item of guestItems) {
    const productId = parseInt(String(item.product_id), 10);
    const qty = parseInt(String(item.quantity ?? 1), 10) || 1;
    if (!Number.isFinite(productId) || productId < 1) {
      skipped += 1;
      continue;
    }

    const prod = await db.collection("products").findOne({ _id: productId, active: { $ne: 0 } });
    if (!prod || !isWebSellable(prod) || isEventProduct(prod)) {
      // Eventos / no vendibles: no se pasan al usuario (cupos requieren login al agregar).
      skipped += 1;
      continue;
    }

    const userMatch = { user_id: userId, product_id: productId };
    const existing = await db.collection("cart_items").findOne(userMatch);
    const nextQty = (existing?.quantity || 0) + qty;
    const avail = await availableForWeb(db, prod);
    const capped = Math.min(nextQty, Math.max(0, avail));
    if (capped < 1) {
      skipped += 1;
      continue;
    }

    await db.collection("cart_items").updateOne(
      userMatch,
      { $set: { user_id: userId, product_id: productId, quantity: capped } },
      { upsert: true }
    );
    merged += 1;
  }

  await db.collection("cart_items").deleteMany({ guest_id: gid });
  return { merged, skipped };
}

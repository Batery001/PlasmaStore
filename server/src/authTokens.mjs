import crypto from "node:crypto";

/**
 * @param {any} db
 * @param {{ type: "verify_email" | "reset_password", user_id: number, email: string, ttlMs?: number }} args
 */
export async function createAuthToken(db, { type, user_id, email, ttlMs = 60 * 60 * 1000 }) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  // invalida tokens previos del mismo tipo/usuario
  const prev = await db
    .collection("auth_tokens")
    .find({ user_id, type, used: { $ne: true } })
    .project({ _id: 1 })
    .toArray();
  for (const p of prev) {
    await db.collection("auth_tokens").updateOne({ _id: p._id }, { $set: { used: true, updatedAt: now } });
  }
  await db.collection("auth_tokens").insertOne({
    _id: token,
    type,
    user_id,
    email: String(email).toLowerCase(),
    used: false,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });
  return { token, expiresAt };
}

/**
 * @param {any} db
 * @param {string} token
 * @param {"verify_email" | "reset_password"} type
 */
export async function consumeAuthToken(db, token, type) {
  const raw = String(token || "").trim();
  if (!raw) return { ok: false, error: "Token inválido." };
  const row = await db.collection("auth_tokens").findOne({ _id: raw, type });
  if (!row) return { ok: false, error: "Enlace inválido o expirado." };
  if (row.used) return { ok: false, error: "Este enlace ya fue usado." };
  const exp = row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt);
  if (!(exp instanceof Date) || Number.isNaN(exp.getTime()) || exp.getTime() < Date.now()) {
    return { ok: false, error: "El enlace expiró. Solicita uno nuevo." };
  }
  await db.collection("auth_tokens").updateOne({ _id: raw }, { $set: { used: true, updatedAt: new Date() } });
  return { ok: true, user_id: row.user_id, email: row.email };
}

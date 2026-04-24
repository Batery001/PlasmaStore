import bcrypt from "bcryptjs";
import { json } from "../_lib/http.js";
import { ADMIN_EMAIL, ADMIN_PASSWORD, BOOTSTRAP_TOKEN } from "../_lib/env.js";
import { mongoDb } from "../_lib/mongo.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

  const token = String(req.headers?.["x-bootstrap-token"] || "").trim();
  if (!token || token !== BOOTSTRAP_TOKEN()) return json(res, 401, { ok: false, error: "Token inválido." });

  const email = ADMIN_EMAIL().toLowerCase();
  const password = ADMIN_PASSWORD();
  if (password.length < 6) return json(res, 400, { ok: false, error: "ADMIN_PASSWORD muy corta (mín 6)." });

  const db = await mongoDb();
  const count = await db.collection("store_users").countDocuments({});
  if (count > 0) return json(res, 409, { ok: false, error: "Ya existen usuarios. Bootstrap bloqueado." });

  const passHash = await bcrypt.hash(password, 10);
  const r = await db.collection("store_users").insertOne({
    email,
    name: "admin",
    role: "admin",
    pass_hash: passHash,
    createdAt: new Date(),
  });

  return json(res, 200, { ok: true, user: { id: String(r.insertedId), email, name: "admin", role: "admin" } });
}

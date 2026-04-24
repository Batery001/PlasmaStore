/**
 * Actualiza pass_hash con bcrypt para un usuario existente (p. ej. si quedó en texto plano en Atlas).
 * Uso: mismo ADMIN_EMAIL y ADMIN_PASSWORD que en .env.local → npm run set-admin-password
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { loadProjectEnv } = await import("../src/loadProjectEnv.mjs");
loadProjectEnv(root);

const { getDb } = await import("../src/mongo.mjs");

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";

if (!email || !email.includes("@")) {
  console.error("Añade ADMIN_EMAIL en .env.local (el mismo email que en store_users).");
  process.exit(1);
}
if (password.length < 6) {
  console.error("Añade ADMIN_PASSWORD (mínimo 6 caracteres) en .env.local.");
  process.exit(1);
}

const db = await getDb();
const passHash = await bcrypt.hash(password, 10);
const r = await db.collection("store_users").updateOne({ email }, { $set: { pass_hash: passHash } });

if (r.matchedCount === 0) {
  console.error(`No hay usuario con email: ${email}`);
  process.exit(1);
}

console.log(`Listo. pass_hash actualizado (bcrypt) para: ${email}`);
console.log("Prueba de nuevo el login en http://localhost:3000/login");
process.exit(0);

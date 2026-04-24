/**
 * Crea el primer usuario admin en MongoDB (solo si no hay ningún admin).
 * Uso: desde la raíz del proyecto → npm run create-admin
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { loadProjectEnv } = await import("../src/loadProjectEnv.mjs");
loadProjectEnv(root);

const { getDb } = await import("../src/mongo.mjs");
const { nextSeq } = await import("../src/counters.mjs");

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";

if (!email || !email.includes("@")) {
  console.error("Añade ADMIN_EMAIL=tu@email.com en .env.local (raíz) o en .env");
  process.exit(1);
}
if (password.length < 6) {
  console.error("Añade ADMIN_PASSWORD= (mínimo 6 caracteres) en .env.local o .env");
  process.exit(1);
}

const db = await getDb();
const adminCount = await db.collection("store_users").countDocuments({ role: "admin" });
if (adminCount > 0) {
  console.log("Ya existe al menos un usuario con rol admin. No se modificó nada.");
  process.exit(0);
}

const exists = await db.collection("store_users").findOne({ email });
if (exists) {
  console.error(
    `Ya existe un usuario con el email ${email} (rol: ${exists.role}). Cambia ADMIN_EMAIL o borra ese usuario en Atlas → Data Explorer.`
  );
  process.exit(1);
}

const id = await nextSeq(db, "user");
const passHash = await bcrypt.hash(password, 10);
await db.collection("store_users").insertOne({
  _id: id,
  email,
  name: "admin",
  role: "admin",
  pass_hash: passHash,
  createdAt: new Date(),
});

console.log(`Listo. Admin creado: ${email}`);
console.log("Entra en /login con ese email y contraseña, luego abre /admin");
process.exit(0);

/**
 * Crea un usuario staff (vendedor POS / órdenes).
 * Uso: STAFF_EMAIL=... STAFF_PASSWORD=... npm run create-staff
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { loadProjectEnv } = await import("../src/loadProjectEnv.mjs");
loadProjectEnv(root);

const { getDb } = await import("../src/db.mjs");
const { nextSeq } = await import("../src/counters.mjs");
const { flushSqlitePersist } = await import("../src/sqliteMongo.mjs");

const email = (process.env.STAFF_EMAIL || "").trim().toLowerCase();
const password = process.env.STAFF_PASSWORD || "";
const name = String(process.env.STAFF_NAME || "vendedor").trim() || "vendedor";

if (!email || !email.includes("@")) {
  console.error("Añade STAFF_EMAIL=tu@email.com en .env.local o el entorno");
  process.exit(1);
}
if (password.length < 6) {
  console.error("Añade STAFF_PASSWORD= (mínimo 6 caracteres)");
  process.exit(1);
}

const db = await getDb();
const exists = await db.collection("store_users").findOne({ email });
if (exists) {
  if (exists.role === "staff") {
    console.log(`Ya existe staff: ${email}`);
    process.exit(0);
  }
  console.error(`El email ${email} ya existe con rol ${exists.role}. Usa otro email.`);
  process.exit(1);
}

const id = await nextSeq(db, "user");
const passHash = await bcrypt.hash(password, 10);
await db.collection("store_users").insertOne({
  _id: id,
  email,
  name,
  role: "staff",
  pass_hash: passHash,
  email_verified: true,
  createdAt: new Date(),
});

flushSqlitePersist();
console.log(`Listo. Staff creado: ${email}`);
console.log("Puede usar POS y órdenes; no configura pagos ni productos.");
process.exit(0);

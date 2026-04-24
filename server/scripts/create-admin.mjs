/**
 * Crea el primer usuario admin en MongoDB (solo si no hay ningún admin).
 * Uso: desde la carpeta server → npm run create-admin
 * Requiere en server/.env: MONGODB_URI, MONGODB_DB, ADMIN_EMAIL, ADMIN_PASSWORD
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { getDb } from "../src/mongo.mjs";
import { nextSeq } from "../src/counters.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";

if (!email || !email.includes("@")) {
  console.error("Añade en server/.env: ADMIN_EMAIL=tu@email.com");
  process.exit(1);
}
if (password.length < 6) {
  console.error("Añade en server/.env: ADMIN_PASSWORD= (mínimo 6 caracteres)");
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
    `Ya existe un usuario con el email ${email} (rol: ${exists.role}). Cambia ADMIN_EMAIL en .env o borra ese usuario en Atlas → Data Explorer.`
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
console.log("Entra en https://TU-SITIO.vercel.app/login con ese email y contraseña, luego abre /admin");
process.exit(0);

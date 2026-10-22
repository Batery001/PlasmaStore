/**
 * Borra un usuario de prueba (hard delete) para poder registrar de nuevo.
 * Uso: node server/scripts/delete-test-user.mjs otaku1089@gmail.com
 *   o: node server/scripts/delete-test-user.mjs raul
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { loadProjectEnv } = await import("../src/loadProjectEnv.mjs");
loadProjectEnv(root);

const { getDb } = await import("../src/db.mjs");
const { flushSqlitePersist } = await import("../src/sqliteMongo.mjs");

const q = String(process.argv[2] || "").trim().toLowerCase();
if (!q) {
  console.error("Uso: node server/scripts/delete-test-user.mjs <email|username>");
  process.exit(1);
}

const db = await getDb();
const filter = q.includes("@") ? { email: q } : { username: q };
const users = await db.collection("store_users").find(filter).toArray();

if (users.length === 0) {
  // también buscar por email parcial / username
  const all = await db.collection("store_users").find({}).toArray();
  const hit = all.filter(
    (u) =>
      String(u.email || "").toLowerCase() === q ||
      String(u.username || "").toLowerCase() === q ||
      String(u.email || "").toLowerCase().includes(q)
  );
  if (hit.length === 0) {
    console.log("No se encontró usuario:", q);
    process.exit(0);
  }
  users.push(...hit);
}

for (const u of users) {
  if (u.role === "admin") {
    console.log("Omitido admin:", u._id, u.email);
    continue;
  }
  const id = u._id;
  await db.collection("cart_items").deleteMany({ user_id: id });
  await db.collection("player_decks").deleteMany({ user_id: id });
  await db.collection("event_registrations").deleteMany({ user_id: id });
  await db.collection("store_users").deleteOne({ _id: id });
  console.log("Eliminado:", id, u.email, u.username);
}

try {
  await flushSqlitePersist();
} catch {
  /* mongo */
}
console.log("Listo. Podés registrar de nuevo con ese email/usuario.");
process.exit(0);

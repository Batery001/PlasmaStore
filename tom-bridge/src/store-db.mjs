import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "store.db");

fs.mkdirSync(DATA_DIR, { recursive: true });

/** @type {import('better-sqlite3').Database | null} */
let db = null;

export function getStoreDb() {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price_cents INTEGER NOT NULL,
      image_url TEXT,
      stock INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS cart_items (
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      PRIMARY KEY (user_id, product_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);
  seedIfEmpty(db);
  return db;
}

/**
 * @param {import('better-sqlite3').Database} database
 */
function seedIfEmpty(database) {
  const { c: nProd } = database.prepare("SELECT COUNT(*) AS c FROM products").get();
  if (nProd === 0) {
    const ins = database.prepare(
      "INSERT INTO products (name, description, price_cents, stock, active) VALUES (?,?,?,?,1)"
    );
    const rows = [
      ["Booster Obsidian Flames", "Sobre en inglés — 10 cartas.", 5990, 40],
      ["Elite Trainer Box 151", "Caja ETB edición especial.", 89990, 5],
      ["Protectores estándar (64 u.)", "Fundas transparentes tamaño estándar.", 4990, 120],
      ["Deck box magnético", "Caja rígida con cierre magnético.", 12990, 25],
      ["Tapete oficial", "Tapete de juego 60×35 cm.", 24990, 8],
      ["Pack 3 sobres promoción", "Promo tienda — surtido.", 7990, 60],
    ];
    for (const r of rows) ins.run(r[0], r[1], r[2], r[3]);
  }

  ensurePlasmaAdmin(database);
}

/**
 * Administrador por defecto: usuario `admin` (guardado en columna email), contraseña `admin123`.
 * Se actualiza en cada arranque para mantener esa contraseña en entornos demo.
 * @param {import('better-sqlite3').Database} database
 */
function ensurePlasmaAdmin(database) {
  const hash = bcrypt.hashSync("admin123", 10);
  const row = database.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get("admin");
  if (row) {
    database
      .prepare("UPDATE users SET password_hash = ?, name = ?, role = ? WHERE id = ?")
      .run(hash, "Plasma Admin", "admin", row.id);
  } else {
    database
      .prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,?)")
      .run("admin", hash, "Plasma Admin", "admin");
  }
}

/**
 * Importa productos del POS (SQLite) a la tienda web local.
 *
 * Uso (desde _plasma_upload):
 *   npm run import-pos-products
 *
 * Env:
 *   POS_SQLITE_PATH  (opcional) ruta a pos.sqlite3
 *                    default: C:\Users\bater\Desktop\plasma store\data\pos.sqlite3
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");

const { loadProjectEnv } = await import("../src/loadProjectEnv.mjs");
loadProjectEnv(root);

function defaultPosPath() {
  return path.join("C:", "Users", "bater", "Desktop", "plasma store", "data", "pos.sqlite3");
}

function slugify(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function openPosDb(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe la DB del POS: ${filePath}`);
  }
  const wasmPath = path.join(path.dirname(require.resolve("sql.js")), "sql-wasm.wasm");
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const buf = fs.readFileSync(filePath);
  return new SQL.Database(buf);
}

function readPosProducts(posDb) {
  const stmt = posDb.prepare(`
    SELECT id, barcode, name, price_cents, stock_qty, active, category, subcategory,
           is_tournament_entry, discount_percent
    FROM products
    ORDER BY id
  `);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

const posPath = process.env.POS_SQLITE_PATH?.trim() || defaultPosPath();
console.log(`[import-pos] leyendo ${posPath}`);

const posDb = await openPosDb(posPath);
const posProducts = readPosProducts(posDb);
posDb.close();

const { getDb } = await import("../src/db.mjs");
const db = await getDb();

const now = new Date();
let upserted = 0;
let skippedTournament = 0;
let maxProductId = 0;
const tagSlugs = new Map(); // slug -> { name, order }

for (const p of posProducts) {
  const id = Number(p.id);
  if (!Number.isFinite(id) || id < 1) continue;
  if (Number(p.is_tournament_entry) === 1) {
    skippedTournament += 1;
    continue;
  }

  const category = String(p.category || "").trim();
  const subcategory = String(p.subcategory || "").trim();
  const tags = [];
  if (category) {
    const slug = slugify(category) || "categoria";
    tags.push(slug);
    if (!tagSlugs.has(slug)) tagSlugs.set(slug, { name: category, order: tagSlugs.size + 1 });
  }
  if (subcategory) {
    const slug = slugify(subcategory);
    if (slug) tags.push(slug);
  }

  const barcode = p.barcode != null ? String(p.barcode).trim() : "";
  const descParts = [];
  if (category) descParts.push(category);
  if (subcategory) descParts.push(subcategory);
  if (barcode) descParts.push(`Código: ${barcode}`);

  const stock = Math.max(0, Math.floor(Number(p.stock_qty) || 0));
  // POS guarda CLP en centavos (×100). La web muestra pesos enteros.
  const price_pesos = Math.max(0, Math.round((Number(p.price_cents) || 0) / 100));
  const discount = Math.max(0, Math.min(100, Math.floor(Number(p.discount_percent) || 0)));
  let compare_price_cents = null;
  let sellPrice = price_pesos;
  if (discount > 0 && discount < 100) {
    compare_price_cents = price_pesos;
    sellPrice = Math.round((price_pesos * (100 - discount)) / 100);
  }

  const prev = await db.collection("products").findOne({ _id: id });

  const doc = {
    _id: id,
    name: String(p.name || "").trim() || `Producto ${id}`,
    description: descParts.join(" · "),
    price_cents: sellPrice,
    compare_price_cents: compare_price_cents ?? undefined,
    stock,
    active: Number(p.active) === 0 ? 0 : 1,
    image_url: prev?.image_url ?? null,
    image_urls: Array.isArray(prev?.image_urls) ? prev.image_urls : prev?.image_url ? [prev.image_url] : [],
    tags,
    barcode: barcode || null,
    pos_id: id,
    source: "pos",
    // Conserva canal si ya lo configuraron en admin; default ambos
    sales_channel: prev?.sales_channel === "store_only" ? "store_only" : "both",
    updatedAt: now,
    createdAt: prev?.createdAt || now,
  };

  await db.collection("products").replaceOne({ _id: id }, doc, { upsert: true });
  upserted += 1;
  if (id > maxProductId) maxProductId = id;
}

// Contador de productos para no colisionar IDs nuevos del admin
const counter = await db.collection("counters").findOne({ _id: "product" });
const currentSeq = Number(counter?.seq || 0);
if (maxProductId > currentSeq) {
  await db.collection("counters").replaceOne(
    { _id: "product" },
    { _id: "product", seq: maxProductId },
    { upsert: true }
  );
}

// Etiquetas / categorías para el menú de la tienda
let tagId = 0;
const existingTags = await db.collection("store_tags").find({}).toArray();
for (const t of existingTags) {
  const n = Number(t._id);
  if (Number.isFinite(n) && n > tagId) tagId = n;
}
for (const [slug, info] of tagSlugs) {
  const existing = await db.collection("store_tags").findOne({ slug });
  if (existing) {
    await db.collection("store_tags").updateOne(
      { _id: existing._id },
      { $set: { name: info.name, active: 1, order: info.order, updatedAt: now } }
    );
    continue;
  }
  tagId += 1;
  await db.collection("store_tags").insertOne({
    _id: tagId,
    name: info.name,
    slug,
    order: info.order,
    active: 1,
    createdAt: now,
    updatedAt: now,
  });
}
const tagCounter = await db.collection("counters").findOne({ _id: "tag" });
const tagSeq = Number(tagCounter?.seq || 0);
if (tagId > tagSeq) {
  await db.collection("counters").replaceOne({ _id: "tag" }, { _id: "tag", seq: tagId }, { upsert: true });
}

const active = await db.collection("products").countDocuments({ active: { $ne: 0 } });
console.log(`[import-pos] listo · upserted=${upserted} · torneo_omitidos=${skippedTournament} · activos_en_web=${active} · tags=${tagSlugs.size}`);
process.exit(0);

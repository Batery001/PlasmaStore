import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import express from "express";
import multer from "multer";
import session from "express-session";
import { getStoreDb } from "./store-db.mjs";

const SESSION_SECRET = process.env.SESSION_SECRET || "trejotienda-dev-cambia-en-produccion";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_UPLOAD_ROOT = path.join(__dirname, "..", "data", "store-uploads");
const PRODUCTS_UPLOAD_DIR = path.join(STORE_UPLOAD_ROOT, "products");
fs.mkdirSync(PRODUCTS_UPLOAD_DIR, { recursive: true });

/**
 * @param {string | null | undefined} imageUrl
 */
function deleteStoredImageFile(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return;
  const trimmed = imageUrl.trim();
  if (!trimmed.startsWith("/store-media/")) return;
  const rel = trimmed.slice("/store-media/".length);
  const abs = path.join(STORE_UPLOAD_ROOT, rel);
  if (!abs.startsWith(STORE_UPLOAD_ROOT)) return;
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
}

const uploadProductImage = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PRODUCTS_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const ok = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"];
      const e = ok.includes(ext) ? ext : ".jpg";
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 12)}${e}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp|avif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error("Solo imágenes JPEG, PNG, GIF, WebP o AVIF."));
  },
});

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function optionalProductImageUpload(req, res, next) {
  const ct = String(req.headers["content-type"] || "");
  if (ct.includes("multipart/form-data")) {
    return uploadProductImage.single("image")(req, res, (err) => {
      if (err) return res.status(400).json({ ok: false, error: err.message || "Archivo inválido." });
      next();
    });
  }
  next();
}

const CAROUSEL_WIDGET_ID = "carousel_home";
const CAROUSEL_MAX = 6;

/**
 * @param {import('better-sqlite3').Database} database
 */
function readCarouselConfig(database) {
  const defaults = { enabled: true, autoMs: 6000, maxSlides: CAROUSEL_MAX, productIds: [] };
  const row = database.prepare("SELECT config_json FROM store_widgets WHERE widget_id = ?").get(CAROUSEL_WIDGET_ID);
  if (!row?.config_json) return defaults;
  try {
    const j = JSON.parse(row.config_json);
    const productIds = Array.isArray(j.productIds)
      ? [...new Set(j.productIds.map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n) && n > 0))].slice(
          0,
          CAROUSEL_MAX
        )
      : [];
    let maxSlides = parseInt(String(j.maxSlides), 10);
    if (!Number.isFinite(maxSlides)) maxSlides = CAROUSEL_MAX;
    maxSlides = Math.min(CAROUSEL_MAX, Math.max(1, maxSlides));
    let autoMs = parseInt(String(j.autoMs), 10);
    if (!Number.isFinite(autoMs)) autoMs = defaults.autoMs;
    autoMs = Math.min(120000, Math.max(0, autoMs));
    const enabled = j.enabled !== false;
    return { enabled, autoMs, maxSlides, productIds: productIds.slice(0, maxSlides) };
  } catch {
    return defaults;
  }
}

/**
 * @param {import('better-sqlite3').Database} database
 * @param {{ enabled: boolean; maxSlides: number; productIds: number[] }} cfg
 */
function buildCarouselProducts(database, cfg) {
  const cols = "id, name, description, price_cents, image_url, stock";
  const limit = cfg.maxSlides;
  const byId = database.prepare(`SELECT ${cols} FROM products WHERE id = ? AND active = 1`);
  const ordered = [];
  const seen = new Set();
  if (cfg.productIds.length > 0) {
    for (const id of cfg.productIds) {
      if (ordered.length >= limit) break;
      const p = byId.get(id);
      if (p && !seen.has(p.id)) {
        seen.add(p.id);
        ordered.push(p);
      }
    }
  }
  if (ordered.length === 0) {
    return database.prepare(`SELECT ${cols} FROM products WHERE active = 1 ORDER BY id LIMIT ?`).all(limit);
  }
  return ordered;
}

/**
 * @param {import('express').Express} app
 */
export function mountStoreAndSession(app) {
  const db = getStoreDb();

  app.use("/store-media", express.static(STORE_UPLOAD_ROOT));

  app.use(
    session({
      name: "trejotienda.sid",
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: "lax",
        path: "/",
      },
    })
  );

  function requireAuth(req, res, next) {
    const uid = req.session?.userId;
    if (!uid) {
      return res.status(401).json({ ok: false, error: "Debes iniciar sesión." });
    }
    const user = db.prepare("SELECT id, email, name, role FROM users WHERE id = ?").get(uid);
    if (!user) {
      req.session.userId = undefined;
      return res.status(401).json({ ok: false, error: "Sesión inválida." });
    }
    req.storeUser = user;
    next();
  }

  function requireAdmin(req, res, next) {
    if (req.storeUser?.role !== "admin") {
      return res.status(403).json({ ok: false, error: "Solo administradores." });
    }
    next();
  }

  app.post("/api/store/register", (req, res) => {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");
    const name = String(req.body?.name || "").trim() || "Cliente";

    if (!email || !email.includes("@")) {
      return res.status(400).json({ ok: false, error: "Email inválido." });
    }
    if (email === "admin") {
      return res.status(400).json({ ok: false, error: "Ese usuario está reservado." });
    }
    if (password.length < 6) {
      return res.status(400).json({ ok: false, error: "La contraseña debe tener al menos 6 caracteres." });
    }

    try {
      const hash = bcrypt.hashSync(password, 10);
      const info = db
        .prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?, 'customer')")
        .run(email, hash, name);
      req.session.userId = info.lastInsertRowid;
      const user = db.prepare("SELECT id, email, name, role FROM users WHERE id = ?").get(info.lastInsertRowid);
      return res.json({ ok: true, user });
    } catch (e) {
      if (String(e).includes("UNIQUE")) {
        return res.status(409).json({ ok: false, error: "Ese email ya está registrado." });
      }
      console.error(e);
      return res.status(500).json({ ok: false, error: "Error al registrar." });
    }
  });

  app.post("/api/store/login", (req, res) => {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");
    const row = db
      .prepare("SELECT id, email, password_hash, name, role FROM users WHERE email = ? COLLATE NOCASE")
      .get(email);
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      return res.status(401).json({ ok: false, error: "Usuario o contraseña incorrectos." });
    }
    req.session.userId = row.id;
    return res.json({
      ok: true,
      user: { id: row.id, email: row.email, name: row.name, role: row.role },
    });
  });

  app.post("/api/store/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ ok: false, error: "No se pudo cerrar sesión." });
      res.clearCookie("trejotienda.sid", { path: "/" });
      res.json({ ok: true });
    });
  });

  app.get("/api/store/me", (req, res) => {
    const uid = req.session?.userId;
    if (!uid) return res.json({ ok: true, user: null });
    const user = db.prepare("SELECT id, email, name, role FROM users WHERE id = ?").get(uid);
    if (!user) {
      req.session.userId = undefined;
      return res.json({ ok: true, user: null });
    }
    res.json({ ok: true, user });
  });

  app.get("/api/store/products", (_req, res) => {
    const rows = db
      .prepare(
        "SELECT id, name, description, price_cents, image_url, stock FROM products WHERE active = 1 ORDER BY id"
      )
      .all();
    res.json({ ok: true, products: rows });
  });

  app.get("/api/store/carousel", (_req, res) => {
    const cfg = readCarouselConfig(db);
    const products = cfg.enabled ? buildCarouselProducts(db, cfg) : [];
    const source = !cfg.enabled ? "off" : cfg.productIds.length > 0 ? "manual" : "fallback";
    res.json({
      ok: true,
      enabled: cfg.enabled,
      autoMs: cfg.autoMs,
      maxSlides: cfg.maxSlides,
      source,
      products,
    });
  });

  app.get("/api/store/cart", requireAuth, (req, res) => {
    const rows = db
      .prepare(
        `SELECT ci.product_id AS productId, ci.quantity, p.name, p.price_cents, p.stock
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         WHERE ci.user_id = ?`
      )
      .all(req.storeUser.id);
    res.json({ ok: true, items: rows });
  });

  app.post("/api/store/cart", requireAuth, (req, res) => {
    const productId = parseInt(String(req.body?.productId), 10);
    let quantity = parseInt(String(req.body?.quantity ?? "1"), 10);
    if (!Number.isFinite(productId) || productId < 1) {
      return res.status(400).json({ ok: false, error: "productId inválido." });
    }
    if (!Number.isFinite(quantity) || quantity < 1) quantity = 1;

    const prod = db.prepare("SELECT id, stock FROM products WHERE id = ? AND active = 1").get(productId);
    if (!prod) return res.status(404).json({ ok: false, error: "Producto no encontrado." });

    const existing = db
      .prepare("SELECT quantity FROM cart_items WHERE user_id = ? AND product_id = ?")
      .get(req.storeUser.id, productId);
    const nextQty = (existing?.quantity || 0) + quantity;
    if (nextQty > prod.stock) {
      return res.status(400).json({ ok: false, error: `Stock insuficiente (máx. ${prod.stock}).` });
    }

    db.prepare(
      `INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?,?,?)
       ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = excluded.quantity`
    ).run(req.storeUser.id, productId, nextQty);

    res.json({ ok: true });
  });

  app.patch("/api/store/cart", requireAuth, (req, res) => {
    const productId = parseInt(String(req.body?.productId), 10);
    const quantity = parseInt(String(req.body?.quantity), 10);
    if (!Number.isFinite(productId) || productId < 1) {
      return res.status(400).json({ ok: false, error: "productId inválido." });
    }
    if (!Number.isFinite(quantity) || quantity < 1) {
      return res.status(400).json({ ok: false, error: "quantity debe ser >= 1." });
    }
    const prod = db.prepare("SELECT stock FROM products WHERE id = ? AND active = 1").get(productId);
    if (!prod) return res.status(404).json({ ok: false, error: "Producto no encontrado." });
    if (quantity > prod.stock) {
      return res.status(400).json({ ok: false, error: `Stock insuficiente (máx. ${prod.stock}).` });
    }
    const r = db
      .prepare("UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?")
      .run(quantity, req.storeUser.id, productId);
    if (r.changes === 0) return res.status(404).json({ ok: false, error: "Ítem no en el carrito." });
    res.json({ ok: true });
  });

  app.delete("/api/store/cart/:productId", requireAuth, (req, res) => {
    const productId = parseInt(req.params.productId, 10);
    db.prepare("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?").run(req.storeUser.id, productId);
    res.json({ ok: true });
  });

  app.get("/api/store/admin/stats", requireAuth, requireAdmin, (_req, res) => {
    const usersTotal = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
    const customersCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'customer'").get().c;
    const adminsCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c;
    const productsTotal = db.prepare("SELECT COUNT(*) AS c FROM products").get().c;
    const productsActive = db.prepare("SELECT COUNT(*) AS c FROM products WHERE active = 1").get().c;
    const lowStockCount = db
      .prepare("SELECT COUNT(*) AS c FROM products WHERE active = 1 AND stock > 0 AND stock < 10")
      .get().c;
    const outOfStockCount = db
      .prepare("SELECT COUNT(*) AS c FROM products WHERE active = 1 AND stock = 0")
      .get().c;
    const cartLineItems = db.prepare("SELECT COUNT(*) AS c FROM cart_items").get().c;
    const cartSessions = db.prepare("SELECT COUNT(DISTINCT user_id) AS c FROM cart_items").get().c;
    const cartAgg = db
      .prepare(
        `SELECT COALESCE(SUM(ci.quantity * p.price_cents), 0) AS valueCents,
                COALESCE(SUM(ci.quantity), 0) AS units
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id`
      )
      .get();
    res.json({
      ok: true,
      stats: {
        usersTotal,
        customersCount,
        adminsCount,
        productsTotal,
        productsActive,
        lowStockCount,
        outOfStockCount,
        cartLineItems,
        cartSessions,
        cartUnits: cartAgg.units,
        cartValueCents: cartAgg.valueCents,
      },
    });
  });

  app.get("/api/store/admin/widgets", requireAuth, requireAdmin, (_req, res) => {
    const carousel = readCarouselConfig(db);
    const catalogProducts = db.prepare("SELECT id, name, active, stock FROM products ORDER BY id").all();
    res.json({
      ok: true,
      carousel,
      catalogProducts,
      supportedWidgets: [{ id: CAROUSEL_WIDGET_ID, label: "Carrusel principal (Destacados)" }],
    });
  });

  app.put("/api/store/admin/widgets", requireAuth, requireAdmin, (req, res) => {
    const c = req.body?.carousel;
    if (!c || typeof c !== "object") {
      return res.status(400).json({ ok: false, error: "Falta el objeto carousel en el cuerpo." });
    }
    let productIds = Array.isArray(c.productIds) ? c.productIds : [];
    productIds = [...new Set(productIds.map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n) && n > 0))].slice(
      0,
      CAROUSEL_MAX
    );
    for (const id of productIds) {
      if (!db.prepare("SELECT id FROM products WHERE id = ?").get(id)) {
        return res.status(400).json({ ok: false, error: `El producto ${id} no existe.` });
      }
    }
    let maxSlides = parseInt(String(c.maxSlides ?? CAROUSEL_MAX), 10);
    if (!Number.isFinite(maxSlides)) maxSlides = CAROUSEL_MAX;
    maxSlides = Math.min(CAROUSEL_MAX, Math.max(1, maxSlides));
    let autoMs = parseInt(String(c.autoMs ?? 6000), 10);
    if (!Number.isFinite(autoMs)) autoMs = 6000;
    autoMs = Math.min(120000, Math.max(0, autoMs));
    const enabled = c.enabled !== false && c.enabled !== 0 && c.enabled !== "0";
    const config_json = JSON.stringify({
      productIds: productIds.slice(0, maxSlides),
      maxSlides,
      autoMs,
      enabled,
    });
    db.prepare(
      "INSERT INTO store_widgets (widget_id, config_json) VALUES (?, ?) ON CONFLICT(widget_id) DO UPDATE SET config_json = excluded.config_json"
    ).run(CAROUSEL_WIDGET_ID, config_json);
    res.json({ ok: true, carousel: readCarouselConfig(db) });
  });

  app.get("/api/store/admin/products", requireAuth, requireAdmin, (_req, res) => {
    const rows = db
      .prepare(
        "SELECT id, name, description, price_cents, image_url, stock, active FROM products ORDER BY id"
      )
      .all();
    res.json({ ok: true, products: rows });
  });

  app.patch(
    "/api/store/admin/products/:id",
    requireAuth,
    requireAdmin,
    optionalProductImageUpload,
    (req, res) => {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ ok: false, error: "id inválido." });
      }
      const prevRow = db.prepare("SELECT id, image_url FROM products WHERE id = ?").get(id);
      if (!prevRow) return res.status(404).json({ ok: false, error: "Producto no encontrado." });

      const fields = [];
      const vals = [];
      if (req.body?.name !== undefined) {
        const name = String(req.body.name).trim();
        if (!name) return res.status(400).json({ ok: false, error: "Nombre vacío." });
        fields.push("name = ?");
        vals.push(name);
      }
      if (req.body?.description !== undefined) {
        fields.push("description = ?");
        vals.push(String(req.body.description));
      }
      if (req.body?.price_cents !== undefined) {
        const price_cents = parseInt(String(req.body.price_cents), 10);
        if (!Number.isFinite(price_cents) || price_cents < 0) {
          return res.status(400).json({ ok: false, error: "Precio inválido." });
        }
        fields.push("price_cents = ?");
        vals.push(price_cents);
      }
      if (req.body?.stock !== undefined) {
        const stock = parseInt(String(req.body.stock), 10);
        if (!Number.isFinite(stock) || stock < 0) {
          return res.status(400).json({ ok: false, error: "Stock inválido." });
        }
        fields.push("stock = ?");
        vals.push(stock);
      }
      if (req.body?.active !== undefined) {
        const active = req.body.active === true || req.body.active === 1 || req.body.active === "1" ? 1 : 0;
        fields.push("active = ?");
        vals.push(active);
      }

      if (req.file) {
        if (prevRow.image_url) deleteStoredImageFile(prevRow.image_url);
        fields.push("image_url = ?");
        vals.push(`/store-media/products/${req.file.filename}`);
      } else if (req.body?.clear_image === true || req.body?.clear_image === "1") {
        if (prevRow.image_url) deleteStoredImageFile(prevRow.image_url);
        fields.push("image_url = ?");
        vals.push(null);
      } else if (req.body?.image_url !== undefined && !req.file) {
        const raw = req.body.image_url;
        if (raw === null || raw === "") {
          if (prevRow.image_url) deleteStoredImageFile(prevRow.image_url);
          fields.push("image_url = ?");
          vals.push(null);
        } else {
          fields.push("image_url = ?");
          vals.push(String(raw).trim());
        }
      }

      if (fields.length === 0) {
        return res.status(400).json({ ok: false, error: "Nada que actualizar." });
      }
      vals.push(id);
      db.prepare(`UPDATE products SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
      const product = db
        .prepare("SELECT id, name, description, price_cents, image_url, stock, active FROM products WHERE id = ?")
        .get(id);
      res.json({ ok: true, product });
    }
  );

  app.get("/api/store/admin/carts", requireAuth, requireAdmin, (_req, res) => {
    const usersWithCart = db
      .prepare(
        `SELECT DISTINCT u.id AS userId, u.email, u.name, u.role
         FROM users u
         JOIN cart_items ci ON ci.user_id = u.id
         ORDER BY u.id`
      )
      .all();
    const itemsStmt = db.prepare(
      `SELECT ci.product_id AS productId, ci.quantity, p.name, p.price_cents, p.stock AS productStock
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = ?
       ORDER BY p.name`
    );
    const carts = usersWithCart.map((u) => {
      const items = itemsStmt.all(u.userId);
      const totalCents = items.reduce((s, i) => s + i.quantity * i.price_cents, 0);
      const units = items.reduce((s, i) => s + i.quantity, 0);
      return {
        userId: u.userId,
        email: u.email,
        name: u.name,
        role: u.role,
        items,
        totalCents,
        units,
        lineCount: items.length,
      };
    });
    res.json({ ok: true, carts });
  });

  app.delete("/api/store/admin/carts/:userId", requireAuth, requireAdmin, (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId) || userId < 1) {
      return res.status(400).json({ ok: false, error: "userId inválido." });
    }
    const r = db.prepare("DELETE FROM cart_items WHERE user_id = ?").run(userId);
    res.json({ ok: true, removed: r.changes });
  });

  app.patch("/api/store/admin/cart-item", requireAuth, requireAdmin, (req, res) => {
    const userId = parseInt(String(req.body?.userId), 10);
    const productId = parseInt(String(req.body?.productId), 10);
    const quantity = parseInt(String(req.body?.quantity), 10);
    if (!Number.isFinite(userId) || userId < 1) {
      return res.status(400).json({ ok: false, error: "userId inválido." });
    }
    if (!Number.isFinite(productId) || productId < 1) {
      return res.status(400).json({ ok: false, error: "productId inválido." });
    }
    if (!Number.isFinite(quantity)) {
      return res.status(400).json({ ok: false, error: "quantity inválido." });
    }
    if (quantity <= 0) {
      db.prepare("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?").run(userId, productId);
      return res.json({ ok: true, removed: true });
    }
    const prod = db.prepare("SELECT stock FROM products WHERE id = ?").get(productId);
    if (!prod) return res.status(404).json({ ok: false, error: "Producto no encontrado." });
    if (quantity > prod.stock) {
      return res.status(400).json({ ok: false, error: `Stock insuficiente (máx. ${prod.stock}).` });
    }
    const r = db
      .prepare(
        `INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?,?,?)
         ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = excluded.quantity`
      )
      .run(userId, productId, quantity);
    res.json({ ok: true, changes: r.changes });
  });

  app.post("/api/store/admin/products", requireAuth, requireAdmin, optionalProductImageUpload, (req, res) => {
    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();
    const price_cents = parseInt(String(req.body?.price_cents), 10);
    const stock = parseInt(String(req.body?.stock ?? "0"), 10);
    if (!name) return res.status(400).json({ ok: false, error: "Nombre obligatorio." });
    if (!Number.isFinite(price_cents) || price_cents < 0) {
      return res.status(400).json({ ok: false, error: "Precio inválido (price_cents)." });
    }
    let image_url = null;
    if (req.file) {
      image_url = `/store-media/products/${req.file.filename}`;
    } else if (req.body?.image_url != null && String(req.body.image_url).trim() !== "") {
      image_url = String(req.body.image_url).trim();
    }
    const info = db
      .prepare(
        "INSERT INTO products (name, description, price_cents, stock, active, image_url) VALUES (?,?,?,?,1,?)"
      )
      .run(
        name,
        description,
        price_cents,
        Number.isFinite(stock) && stock >= 0 ? stock : 0,
        image_url
      );
    const product = db
      .prepare(
        "SELECT id, name, description, price_cents, image_url, stock, active FROM products WHERE id = ?"
      )
      .get(info.lastInsertRowid);
    res.json({ ok: true, product });
  });
}

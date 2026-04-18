import bcrypt from "bcryptjs";
import session from "express-session";
import { getStoreDb } from "./store-db.mjs";

const SESSION_SECRET = process.env.SESSION_SECRET || "trejotienda-dev-cambia-en-produccion";

/**
 * @param {import('express').Express} app
 */
export function mountStoreAndSession(app) {
  const db = getStoreDb();

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

  app.post("/api/store/admin/products", requireAuth, requireAdmin, (req, res) => {
    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();
    const price_cents = parseInt(String(req.body?.price_cents), 10);
    const stock = parseInt(String(req.body?.stock ?? "0"), 10);
    if (!name) return res.status(400).json({ ok: false, error: "Nombre obligatorio." });
    if (!Number.isFinite(price_cents) || price_cents < 0) {
      return res.status(400).json({ ok: false, error: "Precio inválido (price_cents)." });
    }
    const info = db
      .prepare(
        "INSERT INTO products (name, description, price_cents, stock, active) VALUES (?,?,?,?,1)"
      )
      .run(name, description, price_cents, Number.isFinite(stock) && stock >= 0 ? stock : 0);
    const product = db
      .prepare("SELECT id, name, description, price_cents, stock FROM products WHERE id = ?")
      .get(info.lastInsertRowid);
    res.json({ ok: true, product });
  });
}

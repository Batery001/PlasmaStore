import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import multer from "multer";
import { ObjectId } from "mongodb";
import { nextSeq } from "./counters.mjs";
import { clearSessionCookie, makeSessionCookie, readSession } from "./session.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function deckRowKey(fileName, categoryCode, playId) {
  const cc = categoryCode !== "" && categoryCode != null ? String(categoryCode) : "_";
  return `${String(fileName)}|${cc}|${String(playId)}`;
}

/** `_id` numérico (app nueva) u ObjectId (datos viejos / otros orígenes). */
function userIdFromSession(uidStr) {
  const raw = String(uidStr || "").trim();
  if (/^[a-f\d]{24}$/i.test(raw)) {
    try {
      return new ObjectId(raw);
    } catch {
      return null;
    }
  }
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n > 0) return n;
  return null;
}

function deleteStoredImageFile(uploadRoot, imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return;
  const trimmed = imageUrl.trim();
  if (trimmed.startsWith("data:")) return;
  if (!trimmed.startsWith("/store-media/")) return;
  const rel = trimmed.slice("/store-media/".length);
  const abs = path.join(uploadRoot, rel);
  if (!abs.startsWith(uploadRoot)) return;
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
}

/**
 * @param {import('express').Express} app
 * @param {{ getDb: () => Promise<import('mongodb').Db>, uploadRoot: string }} ctx
 */
const IS_VERCEL = Boolean(process.env.VERCEL);

function multerImageUrl(req) {
  if (!req.file) return null;
  if (req.file.buffer && Buffer.isBuffer(req.file.buffer)) {
    const mime = req.file.mimetype || "image/jpeg";
    return `data:${mime};base64,${req.file.buffer.toString("base64")}`;
  }
  if (req.file.filename) return `/store-media/products/${req.file.filename}`;
  return null;
}

export function mountStoreRoutes(app, { getDb, uploadRoot }) {
  const PRODUCTS_DIR = path.join(uploadRoot, "products");
  if (!IS_VERCEL) {
    try {
      fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
    } catch {
      /* ignore */
    }
  }

  const uploadProductImage = multer({
    storage: IS_VERCEL
      ? multer.memoryStorage()
      : multer.diskStorage({
          destination: (_req, _file, cb) => cb(null, PRODUCTS_DIR),
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

  async function requireUser(req) {
    const s = readSession(req);
    if (!s) throw Object.assign(new Error("No autenticado."), { status: 401 });
    const uid = userIdFromSession(s.uid);
    if (uid == null) throw Object.assign(new Error("Sesión inválida."), { status: 401 });
    const db = await getDb();
    const u = await db.collection("store_users").findOne({ _id: uid }, { projection: { email: 1, name: 1, role: 1 } });
    if (!u) throw Object.assign(new Error("No autenticado."), { status: 401 });
    return { id: u._id, email: u.email, name: u.name, role: u.role, admin: u.role === "admin" };
  }

  async function requireAdmin(req) {
    const u = await requireUser(req);
    if (u.role !== "admin") throw Object.assign(new Error("Solo administradores."), { status: 403 });
    return u;
  }

  function handleErr(res, e) {
    const status = e.status && Number.isFinite(e.status) ? e.status : 400;
    const msg = e instanceof Error ? e.message : String(e);
    const code = msg.includes("Solo administradores") ? 403 : msg.includes("autentic") ? 401 : status;
    res.status(code).json({ ok: false, error: msg });
  }

  app.post("/api/store/bootstrap-admin", async (req, res) => {
    try {
      const token = String(req.headers["x-bootstrap-token"] || "").trim();
      const boot = process.env.BOOTSTRAP_TOKEN ? String(process.env.BOOTSTRAP_TOKEN).trim() : "";
      const email = process.env.ADMIN_EMAIL ? String(process.env.ADMIN_EMAIL).trim().toLowerCase() : "";
      const password = process.env.ADMIN_PASSWORD ? String(process.env.ADMIN_PASSWORD) : "";
      if (!boot || token !== boot) return res.status(401).json({ ok: false, error: "Token inválido." });
      if (!email || !email.includes("@")) return res.status(400).json({ ok: false, error: "ADMIN_EMAIL inválido." });
      if (password.length < 6) return res.status(400).json({ ok: false, error: "ADMIN_PASSWORD muy corta (mín 6)." });
      const db = await getDb();
      const count = await db.collection("store_users").countDocuments({});
      if (count > 0) return res.status(409).json({ ok: false, error: "Ya existen usuarios. Bootstrap bloqueado." });
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
      res.json({ ok: true, user: { id, email, name: "admin", role: "admin" } });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/me", async (req, res) => {
    try {
      const s = readSession(req);
      if (!s) return res.json({ user: null });
      const uid = userIdFromSession(s.uid);
      if (uid == null) return res.json({ user: null });
      const db = await getDb();
      const u = await db.collection("store_users").findOne({ _id: uid }, { projection: { email: 1, name: 1, role: 1 } });
      if (!u) return res.json({ user: null });
      res.json({ user: { id: u._id, email: u.email, name: u.name, role: u.role } });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/logout", (_req, res) => {
    res.setHeader("Set-Cookie", clearSessionCookie());
    res.json({ ok: true });
  });

  app.post("/api/store/register", async (req, res) => {
    try {
      const db = await getDb();
      const email = String(req.body?.email || "")
        .trim()
        .toLowerCase();
      const password = String(req.body?.password || "").trim();
      const name = String(req.body?.name || "").trim() || email.split("@")[0] || "usuario";
      if (!email || !email.includes("@")) return res.status(400).json({ ok: false, error: "Email inválido." });
      if (password.length < 6) return res.status(400).json({ ok: false, error: "La contraseña debe tener al menos 6 caracteres." });
      const exists = await db.collection("store_users").findOne({ email }, { projection: { _id: 1 } });
      if (exists) return res.status(409).json({ ok: false, error: "Ese email ya está registrado." });
      const id = await nextSeq(db, "user");
      const passHash = await bcrypt.hash(password, 10);
      await db.collection("store_users").insertOne({
        _id: id,
        email,
        name,
        role: "customer",
        pass_hash: passHash,
        createdAt: new Date(),
      });
      const cookie = makeSessionCookie({ uid: String(id), admin: false }, 60 * 60 * 24 * 14);
      res.setHeader("Set-Cookie", cookie);
      res.json({ ok: true, user: { id, email, name, role: "customer" } });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/login", async (req, res) => {
    try {
      const db = await getDb();
      const email = String(req.body?.email || req.body?.emailOrUser || "")
        .trim()
        .toLowerCase();
      const password = String(req.body?.password || "").trim();
      if (!email || !password) return res.status(400).json({ ok: false, error: "Faltan credenciales." });
      const row = await db.collection("store_users").findOne({ email });
      if (!row?.pass_hash) return res.status(401).json({ ok: false, error: "Usuario o contraseña incorrectos." });
      const ok = await bcrypt.compare(password, String(row.pass_hash));
      if (!ok) return res.status(401).json({ ok: false, error: "Usuario o contraseña incorrectos." });
      const cookie = makeSessionCookie({ uid: String(row._id), admin: row.role === "admin" }, 60 * 60 * 24 * 14);
      res.setHeader("Set-Cookie", cookie);
      res.json({
        ok: true,
        user: { id: row._id, email: row.email, name: row.name, role: row.role },
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/products", async (_req, res) => {
    try {
      const db = await getDb();
      const products = await db
        .collection("products")
        .find({ active: { $ne: 0 } })
        .project({ name: 1, description: 1, price_cents: 1, stock: 1, image_url: 1 })
        .sort({ _id: 1 })
        .toArray();
      res.json({
        ok: true,
        products: products.map((p) => ({
          id: p._id,
          name: p.name,
          description: p.description || "",
          price_cents: p.price_cents || 0,
          stock: p.stock || 0,
          image_url: p.image_url ?? null,
        })),
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  async function readCarouselConfig(db) {
    const defaults = { enabled: true, autoMs: 6000, maxSlides: CAROUSEL_MAX, productIds: [] };
    const w = await db.collection("store_widgets").findOne({ widget_id: CAROUSEL_WIDGET_ID });
    let cfg = { ...defaults };
    try {
      if (w?.config_json) {
        const j = typeof w.config_json === "string" ? JSON.parse(w.config_json) : w.config_json;
        cfg.enabled = j?.enabled !== false;
        cfg.autoMs = Number.isFinite(j?.autoMs) ? Math.max(0, Math.min(120000, j.autoMs)) : defaults.autoMs;
        let maxSlides = parseInt(String(j?.maxSlides ?? CAROUSEL_MAX), 10);
        if (!Number.isFinite(maxSlides)) maxSlides = CAROUSEL_MAX;
        cfg.maxSlides = Math.min(CAROUSEL_MAX, Math.max(1, maxSlides));
        const ids = Array.isArray(j?.productIds)
          ? j.productIds.map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n) && n > 0)
          : [];
        cfg.productIds = [...new Set(ids)].slice(0, cfg.maxSlides);
      }
    } catch {
      /* ignore */
    }
    return cfg;
  }

  app.get("/api/store/carousel", async (_req, res) => {
    try {
      const db = await getDb();
      const cfg = await readCarouselConfig(db);
      let products = [];
      if (cfg.enabled) {
        if (cfg.productIds.length > 0) {
          const data = await db
            .collection("products")
            .find({ _id: { $in: cfg.productIds }, active: { $ne: 0 } })
            .project({ name: 1, description: 1, price_cents: 1, stock: 1, image_url: 1 })
            .toArray();
          const byId = new Map(data.map((p) => [p._id, p]));
          products = cfg.productIds.map((id) => byId.get(id)).filter(Boolean);
        } else {
          products = await db
            .collection("products")
            .find({ active: { $ne: 0 } })
            .project({ name: 1, description: 1, price_cents: 1, stock: 1, image_url: 1 })
            .sort({ _id: 1 })
            .limit(6)
            .toArray();
        }
      }
      const source = !cfg.enabled ? "off" : cfg.productIds.length > 0 ? "manual" : "fallback";
      res.json({
        ok: true,
        enabled: cfg.enabled,
        autoMs: cfg.autoMs,
        maxSlides: cfg.maxSlides,
        source,
        products: products.map((p) => ({
          id: p._id,
          name: p.name,
          description: p.description || "",
          price_cents: p.price_cents || 0,
          stock: p.stock || 0,
          image_url: p.image_url ?? null,
        })),
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/cart", async (req, res) => {
    try {
      const u = await requireUser(req);
      const db = await getDb();
      const rows = await db
        .collection("cart_items")
        .aggregate([
          { $match: { user_id: u.id } },
          {
            $lookup: {
              from: "products",
              localField: "product_id",
              foreignField: "_id",
              as: "p",
            },
          },
          { $unwind: "$p" },
          {
            $project: {
              productId: "$product_id",
              quantity: 1,
              name: "$p.name",
              price_cents: "$p.price_cents",
              stock: "$p.stock",
            },
          },
        ])
        .toArray();
      res.json({ ok: true, items: rows });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/cart", async (req, res) => {
    try {
      const u = await requireUser(req);
      const db = await getDb();
      const productId = parseInt(String(req.body?.productId), 10);
      let quantity = parseInt(String(req.body?.quantity ?? "1"), 10);
      if (!Number.isFinite(productId) || productId < 1) return res.status(400).json({ ok: false, error: "productId inválido." });
      if (!Number.isFinite(quantity) || quantity < 1) quantity = 1;
      const prod = await db.collection("products").findOne({ _id: productId, active: { $ne: 0 } });
      if (!prod) return res.status(404).json({ ok: false, error: "Producto no encontrado." });
      const existing = await db.collection("cart_items").findOne({ user_id: u.id, product_id: productId });
      const nextQty = (existing?.quantity || 0) + quantity;
      if (nextQty > prod.stock) return res.status(400).json({ ok: false, error: `Stock insuficiente (máx. ${prod.stock}).` });
      await db.collection("cart_items").updateOne(
        { user_id: u.id, product_id: productId },
        { $set: { user_id: u.id, product_id: productId, quantity: nextQty } },
        { upsert: true }
      );
      res.json({ ok: true });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.patch("/api/store/cart", async (req, res) => {
    try {
      const u = await requireUser(req);
      const db = await getDb();
      const productId = parseInt(String(req.body?.productId), 10);
      const quantity = parseInt(String(req.body?.quantity), 10);
      if (!Number.isFinite(productId) || productId < 1) return res.status(400).json({ ok: false, error: "productId inválido." });
      if (!Number.isFinite(quantity) || quantity < 1) return res.status(400).json({ ok: false, error: "quantity debe ser >= 1." });
      const prod = await db.collection("products").findOne({ _id: productId, active: { $ne: 0 } });
      if (!prod) return res.status(404).json({ ok: false, error: "Producto no encontrado." });
      if (quantity > prod.stock) return res.status(400).json({ ok: false, error: `Stock insuficiente (máx. ${prod.stock}).` });
      const r = await db.collection("cart_items").updateOne(
        { user_id: u.id, product_id: productId },
        { $set: { quantity } }
      );
      if (r.matchedCount === 0) return res.status(404).json({ ok: false, error: "Ítem no en el carrito." });
      res.json({ ok: true });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.delete("/api/store/cart/:productId", async (req, res) => {
    try {
      const u = await requireUser(req);
      const db = await getDb();
      const productId = parseInt(req.params.productId, 10);
      await db.collection("cart_items").deleteMany({ user_id: u.id, product_id: productId });
      res.json({ ok: true });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/admin/stats", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const usersTotal = await db.collection("store_users").countDocuments({});
      const customersCount = await db.collection("store_users").countDocuments({ role: "customer" });
      const adminsCount = await db.collection("store_users").countDocuments({ role: "admin" });
      const productsTotal = await db.collection("products").countDocuments({});
      const productsActive = await db.collection("products").countDocuments({ active: { $ne: 0 } });
      const lowStockCount = await db.collection("products").countDocuments({ active: { $ne: 0 }, stock: { $gt: 0, $lt: 10 } });
      const outOfStockCount = await db.collection("products").countDocuments({ active: { $ne: 0 }, stock: 0 });
      const cartLineItems = await db.collection("cart_items").countDocuments({});
      const cartSessions = (await db.collection("cart_items").distinct("user_id")).length;
      const cartAgg = await db
        .collection("cart_items")
        .aggregate([
          { $lookup: { from: "products", localField: "product_id", foreignField: "_id", as: "p" } },
          { $unwind: "$p" },
          {
            $group: {
              _id: null,
              valueCents: { $sum: { $multiply: ["$quantity", "$p.price_cents"] } },
              units: { $sum: "$quantity" },
            },
          },
        ])
        .toArray();
      const row = cartAgg[0] || { valueCents: 0, units: 0 };
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
          cartUnits: row.units || 0,
          cartValueCents: row.valueCents || 0,
        },
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/admin/tournament-deck-overrides", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const data = await db.collection("tournament_deck_overrides").find({}).project({ _id: 0, k: 1, entry: 1 }).toArray();
      const overrides = Object.fromEntries(data.map((r) => [r.k, r.entry]));
      res.json({ ok: true, overrides });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.patch("/api/store/admin/tournament-deck-overrides", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const body = req.body || {};
      let key = String(body.key || "").trim();
      if (!key && body.fileName && body.playId) {
        key = deckRowKey(String(body.fileName), body.categoryCode != null ? String(body.categoryCode) : "", String(body.playId));
      }
      if (!key) return res.status(400).json({ ok: false, error: "Falta key o fileName/categoryCode/playId." });

      if (body.remove === true) {
        await db.collection("tournament_deck_overrides").deleteOne({ k: key });
      } else {
        const prev =
          (await db.collection("tournament_deck_overrides").findOne({ k: key }, { projection: { _id: 0, entry: 1 } }))?.entry || {};
        const sprites = Array.isArray(body.sprites)
          ? body.sprites.map((u) => String(u).trim()).filter(Boolean).slice(0, 4)
          : Array.isArray(prev.sprites)
            ? prev.sprites
            : [];
        let countryCode = "";
        if (body.countryCode !== undefined && body.countryCode !== null) {
          const raw = String(body.countryCode).trim();
          countryCode = raw.length === 2 ? raw.toUpperCase() : "";
        } else if (typeof prev.countryCode === "string" && prev.countryCode.length === 2) {
          countryCode = prev.countryCode.toUpperCase();
        }
        let listUrl = "";
        if (body.listUrl !== undefined && body.listUrl !== null) {
          listUrl = String(body.listUrl).trim().slice(0, 2000);
        } else if (typeof prev.listUrl === "string") {
          listUrl = prev.listUrl.trim().slice(0, 2000);
        }
        const entry = { sprites };
        if (countryCode) entry.countryCode = countryCode;
        if (listUrl) entry.listUrl = listUrl;
        if (!entry.sprites.length && !entry.countryCode && !entry.listUrl) {
          await db.collection("tournament_deck_overrides").deleteOne({ k: key });
        } else {
          await db.collection("tournament_deck_overrides").updateOne(
            { k: key },
            { $set: { k: key, entry, updatedAt: new Date() } },
            { upsert: true }
          );
        }
      }
      const all = await db.collection("tournament_deck_overrides").find({}).project({ _id: 0, k: 1, entry: 1 }).toArray();
      const overrides = Object.fromEntries(all.map((r) => [r.k, r.entry]));
      res.json({ ok: true, key, entry: overrides[key] ?? null, overrides });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/admin/widgets", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const carousel = await readCarouselConfig(db);
      const prows = await db
        .collection("products")
        .find({})
        .project({ name: 1, active: 1, stock: 1 })
        .sort({ _id: 1 })
        .toArray();
      const catalogProducts = prows.map((p) => ({
        id: p._id,
        name: p.name,
        active: p.active ? 1 : 0,
        stock: p.stock || 0,
      }));
      res.json({
        ok: true,
        carousel,
        catalogProducts,
        supportedWidgets: [{ id: CAROUSEL_WIDGET_ID, label: "Carrusel principal (Destacados)" }],
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.put("/api/store/admin/widgets", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const c = req.body?.carousel;
      if (!c || typeof c !== "object") return res.status(400).json({ ok: false, error: "Falta el objeto carousel en el cuerpo." });
      let productIds = Array.isArray(c.productIds) ? c.productIds : [];
      productIds = [...new Set(productIds.map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n) && n > 0))].slice(
        0,
        CAROUSEL_MAX
      );
      for (const id of productIds) {
        const ex = await db.collection("products").findOne({ _id: id }, { projection: { _id: 1 } });
        if (!ex) return res.status(400).json({ ok: false, error: `El producto ${id} no existe.` });
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
      await db.collection("store_widgets").updateOne(
        { widget_id: CAROUSEL_WIDGET_ID },
        { $set: { widget_id: CAROUSEL_WIDGET_ID, config_json } },
        { upsert: true }
      );
      res.json({ ok: true, carousel: await readCarouselConfig(db) });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/admin/products", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const rows = await db
        .collection("products")
        .find({})
        .project({ name: 1, description: 1, price_cents: 1, image_url: 1, stock: 1, active: 1 })
        .sort({ _id: 1 })
        .toArray();
      res.json({
        ok: true,
        products: rows.map((p) => ({
          id: p._id,
          name: p.name,
          description: p.description || "",
          price_cents: p.price_cents || 0,
          image_url: p.image_url ?? null,
          stock: p.stock || 0,
          active: p.active ? 1 : 0,
        })),
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/admin/products", optionalProductImageUpload, async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const name = String(req.body?.name || "").trim();
      const description = String(req.body?.description || "").trim();
      const price_cents = parseInt(String(req.body?.price_cents), 10);
      const stock = parseInt(String(req.body?.stock ?? "0"), 10);
      if (!name) return res.status(400).json({ ok: false, error: "Nombre obligatorio." });
      if (!Number.isFinite(price_cents) || price_cents < 0) return res.status(400).json({ ok: false, error: "Precio inválido (price_cents)." });
      let image_url = null;
      if (req.file) {
        image_url = multerImageUrl(req);
      } else if (req.body?.image_url != null && String(req.body.image_url).trim() !== "") {
        image_url = String(req.body.image_url).trim();
      }
      const id = await nextSeq(db, "product");
      await db.collection("products").insertOne({
        _id: id,
        name,
        description,
        price_cents,
        stock: Number.isFinite(stock) && stock >= 0 ? stock : 0,
        active: 1,
        image_url,
      });
      const product = await db.collection("products").findOne({ _id: id });
      res.json({
        ok: true,
        product: {
          id: product._id,
          name: product.name,
          description: product.description || "",
          price_cents: product.price_cents,
          image_url: product.image_url ?? null,
          stock: product.stock,
          active: product.active ? 1 : 0,
        },
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.patch("/api/store/admin/products/:id", optionalProductImageUpload, async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ ok: false, error: "id inválido." });
      const prevRow = await db.collection("products").findOne({ _id: id });
      if (!prevRow) return res.status(404).json({ ok: false, error: "Producto no encontrado." });

      const $set = {};
      if (req.body?.name !== undefined) {
        const name = String(req.body.name).trim();
        if (!name) return res.status(400).json({ ok: false, error: "Nombre vacío." });
        $set.name = name;
      }
      if (req.body?.description !== undefined) $set.description = String(req.body.description);
      if (req.body?.price_cents !== undefined) {
        const price_cents = parseInt(String(req.body.price_cents), 10);
        if (!Number.isFinite(price_cents) || price_cents < 0) return res.status(400).json({ ok: false, error: "Precio inválido." });
        $set.price_cents = price_cents;
      }
      if (req.body?.stock !== undefined) {
        const stock = parseInt(String(req.body.stock), 10);
        if (!Number.isFinite(stock) || stock < 0) return res.status(400).json({ ok: false, error: "Stock inválido." });
        $set.stock = stock;
      }
      if (req.body?.active !== undefined) {
        const active = req.body.active === true || req.body.active === 1 || req.body.active === "1" ? 1 : 0;
        $set.active = active;
      }

      if (req.file) {
        if (prevRow.image_url) deleteStoredImageFile(uploadRoot, prevRow.image_url);
        $set.image_url = multerImageUrl(req);
      } else if (req.body?.clear_image === true || req.body?.clear_image === "1") {
        if (prevRow.image_url) deleteStoredImageFile(uploadRoot, prevRow.image_url);
        $set.image_url = null;
      } else if (req.body?.image_url !== undefined && !req.file) {
        const raw = req.body.image_url;
        if (raw === null || raw === "") {
          if (prevRow.image_url) deleteStoredImageFile(uploadRoot, prevRow.image_url);
          $set.image_url = null;
        } else {
          $set.image_url = String(raw).trim();
        }
      }

      if (Object.keys($set).length === 0) return res.status(400).json({ ok: false, error: "Nada que actualizar." });
      await db.collection("products").updateOne({ _id: id }, { $set });
      const product = await db.collection("products").findOne({ _id: id });
      res.json({
        ok: true,
        product: {
          id: product._id,
          name: product.name,
          description: product.description || "",
          price_cents: product.price_cents,
          image_url: product.image_url ?? null,
          stock: product.stock,
          active: product.active ? 1 : 0,
        },
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/admin/carts", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const userIds = await db.collection("cart_items").distinct("user_id");
      const carts = [];
      for (const userId of userIds.sort((a, b) => a - b)) {
        const u = await db.collection("store_users").findOne({ _id: userId }, { projection: { email: 1, name: 1, role: 1 } });
        if (!u) continue;
        const items = await db
          .collection("cart_items")
          .aggregate([
            { $match: { user_id: userId } },
            { $lookup: { from: "products", localField: "product_id", foreignField: "_id", as: "p" } },
            { $unwind: "$p" },
            {
              $project: {
                productId: "$product_id",
                quantity: 1,
                name: "$p.name",
                price_cents: "$p.price_cents",
                productStock: "$p.stock",
              },
            },
            { $sort: { name: 1 } },
          ])
          .toArray();
        const totalCents = items.reduce((s, i) => s + i.quantity * i.price_cents, 0);
        const units = items.reduce((s, i) => s + i.quantity, 0);
        carts.push({
          userId,
          email: u.email,
          name: u.name,
          role: u.role,
          items,
          totalCents,
          units,
          lineCount: items.length,
        });
      }
      res.json({ ok: true, carts });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.delete("/api/store/admin/carts/:userId", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const userId = parseInt(req.params.userId, 10);
      if (!Number.isFinite(userId) || userId < 1) return res.status(400).json({ ok: false, error: "userId inválido." });
      const r = await db.collection("cart_items").deleteMany({ user_id: userId });
      res.json({ ok: true, removed: r.deletedCount });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.patch("/api/store/admin/cart-item", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const userId = parseInt(String(req.body?.userId), 10);
      const productId = parseInt(String(req.body?.productId), 10);
      const quantity = parseInt(String(req.body?.quantity), 10);
      if (!Number.isFinite(userId) || userId < 1) return res.status(400).json({ ok: false, error: "userId inválido." });
      if (!Number.isFinite(productId) || productId < 1) return res.status(400).json({ ok: false, error: "productId inválido." });
      if (!Number.isFinite(quantity)) return res.status(400).json({ ok: false, error: "quantity inválido." });
      if (quantity <= 0) {
        await db.collection("cart_items").deleteMany({ user_id: userId, product_id: productId });
        return res.json({ ok: true, removed: true });
      }
      const prod = await db.collection("products").findOne({ _id: productId });
      if (!prod) return res.status(404).json({ ok: false, error: "Producto no encontrado." });
      if (quantity > prod.stock) return res.status(400).json({ ok: false, error: `Stock insuficiente (máx. ${prod.stock}).` });
      await db.collection("cart_items").updateOne(
        { user_id: userId, product_id: productId },
        { $set: { user_id: userId, product_id: productId, quantity } },
        { upsert: true }
      );
      res.json({ ok: true });
    } catch (e) {
      handleErr(res, e);
    }
  });
}

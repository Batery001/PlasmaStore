import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import multer from "multer";
import { ObjectId } from "mongodb";
import { Environment, IntegrationApiKeys, IntegrationCommerceCodes, Options, WebpayPlus } from "transbank-sdk";
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

  function optionalProductImagesUpload(req, res, next) {
    const ct = String(req.headers["content-type"] || "");
    if (ct.includes("multipart/form-data")) {
      return uploadProductImage.array("images", 10)(req, res, (err) => {
        if (err) return res.status(400).json({ ok: false, error: err.message || "Archivos inválidos." });
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

  function slugify(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  }

  // =========================
  // Limitless card search (para Admin → Singles)
  // =========================
  const limitlessCache = new Map(); // key -> { at: number, items: any[] }
  const LIMITLESS_CACHE_MS = 45_000;

  function parseLimitlessCardResults(html, maxItems) {
    const out = [];
    if (!html || typeof html !== "string") return out;

    // En algunas vistas, Limitless renderiza links absolutos.
    // Usamos display=text porque incluye resultados en el HTML sin JS.
    const reA =
      /<a\b[^>]*href="(?:https?:\/\/limitlesstcg\.com)?\/cards\/([^\/"]+)\/([^\/"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = reA.exec(html)) && out.length < maxItems) {
      const set = String(m[1] || "").trim().toUpperCase();
      const number = String(m[2] || "").trim();
      const block = String(m[3] || "");

      // nombre: en display=text el texto del <a> suele ser el nombre
      let name = block.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      // normalizar HTML entities básicas
      name = name
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");

      if (!set || !number) continue;
      const key = `${set}/${number}`;
      if (out.some((x) => x.key === key)) continue;
      out.push({
        key,
        set,
        number,
        name: name || `${set} ${number}`,
        page_url: `https://limitlesstcg.com/cards/${encodeURIComponent(set)}/${encodeURIComponent(number)}`,
        image_url: null,
      });
    }
    return out;
  }

  app.get("/api/store/admin/limitless/cards", async (req, res) => {
    try {
      await requireAdmin(req);
      const q = String(req.query?.q || "").trim();
      const lang = String(req.query?.lang || "en").trim().toLowerCase();
      const limitRaw = parseInt(String(req.query?.limit || "12"), 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(25, Math.max(1, limitRaw)) : 12;

      if (!q) return res.json({ ok: true, q, items: [] });
      if (q.length < 2) return res.json({ ok: true, q, items: [] });

      const cacheKey = `${lang}|${q.toLowerCase()}|${limit}`;
      const now = Date.now();
      const cached = limitlessCache.get(cacheKey);
      if (cached && now - cached.at < LIMITLESS_CACHE_MS) {
        return res.json({ ok: true, q, items: cached.items });
      }

      const url = `https://limitlesstcg.com/cards?q=${encodeURIComponent(q)}&lang=${encodeURIComponent(lang)}&display=text&show=${limit}`;
      const r = await fetch(url, {
        headers: {
          "user-agent": "PlasmaStore/1.0 (+admin singles search)",
          accept: "text/html,application/xhtml+xml",
        },
      });
      if (!r.ok) return res.status(502).json({ ok: false, error: "No se pudo consultar Limitless." });
      const html = await r.text();
      const items = parseLimitlessCardResults(html, limit);
      limitlessCache.set(cacheKey, { at: now, items });
      res.json({ ok: true, q, items });
    } catch (e) {
      handleErr(res, e);
    }
  });

  function makeWebpayTx() {
    const envRaw = String(process.env.WEBPAY_ENV || "integration").trim().toLowerCase();
    const isIntegration = envRaw === "integration" || envRaw === "test" || envRaw === "int";

    const commerceCode = isIntegration
      ? IntegrationCommerceCodes.WEBPAY_PLUS
      : String(process.env.WEBPAY_COMMERCE_CODE || "").trim();
    const apiKey = isIntegration ? IntegrationApiKeys.WEBPAY : String(process.env.WEBPAY_API_KEY || "").trim();
    const env = isIntegration ? Environment.Integration : Environment.Production;

    if (!isIntegration) {
      if (!commerceCode) throw Object.assign(new Error("Falta WEBPAY_COMMERCE_CODE."), { status: 400 });
      if (!apiKey) throw Object.assign(new Error("Falta WEBPAY_API_KEY."), { status: 400 });
    }

    return new WebpayPlus.Transaction(new Options(commerceCode, apiKey, env));
  }

  function resolvePublicBaseUrl(req) {
    const forced = String(process.env.PUBLIC_BASE_URL || "").trim();
    if (forced) return forced.replace(/\/+$/, "");
    const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() || "http";
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
    if (!host) return "http://localhost:3000";
    return `${proto}://${host}`.replace(/\/+$/, "");
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

  // =========================
  // Etiquetas / categorías (OpenCart-like)
  // =========================
  app.get("/api/store/tags", async (_req, res) => {
    try {
      const db = await getDb();
      const tags = await db
        .collection("store_tags")
        .find({ active: { $ne: 0 } })
        .project({ name: 1, slug: 1, order: 1 })
        .sort({ order: 1, name: 1 })
        .toArray();
      res.json({
        ok: true,
        tags: tags.map((t) => ({ id: t._id, name: t.name, slug: t.slug, order: t.order ?? 999 })),
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/admin/tags", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const tags = await db
        .collection("store_tags")
        .find({})
        .project({ name: 1, slug: 1, order: 1, active: 1, createdAt: 1, updatedAt: 1 })
        .sort({ order: 1, name: 1 })
        .toArray();
      res.json({ ok: true, tags });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/admin/tags", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const name = String(req.body?.name || "").trim();
      const order = parseInt(String(req.body?.order ?? "999"), 10);
      const active = req.body?.active === false || req.body?.active === 0 ? 0 : 1;
      const slugRaw = String(req.body?.slug || "");
      const slug = slugify(slugRaw || name);
      if (!name) return res.status(400).json({ ok: false, error: "Nombre requerido." });
      if (!slug) return res.status(400).json({ ok: false, error: "Slug inválido." });
      const id = await nextSeq(db, "tag");
      const now = new Date();
      await db.collection("store_tags").insertOne({
        _id: id,
        name,
        slug,
        order: Number.isFinite(order) ? order : 999,
        active,
        createdAt: now,
        updatedAt: now,
      });
      res.json({ ok: true, tag: { id, name, slug, order: Number.isFinite(order) ? order : 999, active } });
    } catch (e) {
      // slug unique
      if (String(e?.message || "").includes("E11000")) return res.status(409).json({ ok: false, error: "Slug ya existe." });
      handleErr(res, e);
    }
  });

  app.put("/api/store/admin/tags/:id", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: "ID inválido." });
      const patch = {};
      if (req.body?.name != null) patch.name = String(req.body.name).trim();
      if (req.body?.slug != null) patch.slug = slugify(req.body.slug);
      if (req.body?.order != null) {
        const o = parseInt(String(req.body.order), 10);
        if (Number.isFinite(o)) patch.order = o;
      }
      if (req.body?.active != null) patch.active = req.body.active === false || req.body.active === 0 ? 0 : 1;
      patch.updatedAt = new Date();
      if (patch.name === "") return res.status(400).json({ ok: false, error: "Nombre inválido." });
      if (patch.slug === "") return res.status(400).json({ ok: false, error: "Slug inválido." });
      const r = await db.collection("store_tags").findOneAndUpdate({ _id: id }, { $set: patch }, { returnDocument: "after" });
      if (!r?.value) return res.status(404).json({ ok: false, error: "Etiqueta no encontrada." });
      res.json({ ok: true, tag: r.value });
    } catch (e) {
      if (String(e?.message || "").includes("E11000")) return res.status(409).json({ ok: false, error: "Slug ya existe." });
      handleErr(res, e);
    }
  });

  app.delete("/api/store/admin/tags/:id", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: "ID inválido." });
      await db.collection("store_tags").updateOne({ _id: id }, { $set: { active: 0, updatedAt: new Date() } });
      res.json({ ok: true });
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
      const u = await db.collection("store_users").findOne(
        { _id: uid },
        { projection: { email: 1, name: 1, role: 1, username: 1, first_name: 1, last_name: 1, birth_day: 1, birth_month: 1, birth_year: 1 } }
      );
      if (!u) return res.json({ user: null });
      res.json({
        user: {
          id: u._id,
          email: u.email,
          name: u.name,
          role: u.role,
          username: u.username ?? null,
          first_name: u.first_name ?? null,
          last_name: u.last_name ?? null,
          birth_day: u.birth_day ?? null,
          birth_month: u.birth_month ?? null,
          birth_year: u.birth_year ?? null,
        },
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.patch("/api/store/me", async (req, res) => {
    try {
      const u = await requireUser(req);
      const db = await getDb();

      const patch = {};

      if (req.body?.username != null) {
        const usernameRaw = String(req.body.username || "").trim();
        const username = usernameRaw.toLowerCase();
        if (!username || username.length < 3) return res.status(400).json({ ok: false, error: "Nombre de usuario inválido (mín. 3 caracteres)." });
        if (!/^[a-z0-9_\\.\\-]+$/i.test(username)) {
          return res.status(400).json({ ok: false, error: "El nombre de usuario solo puede usar letras, números, guión, punto y guión bajo." });
        }
        const existsUser = await db.collection("store_users").findOne({ username, _id: { $ne: u.id } }, { projection: { _id: 1 } });
        if (existsUser) return res.status(409).json({ ok: false, error: "Ese nombre de usuario ya está en uso." });
        patch.username = username;
      }

      const first_name = req.body?.first_name != null ? String(req.body.first_name || "").trim() : null;
      const last_name = req.body?.last_name != null ? String(req.body.last_name || "").trim() : null;
      if (first_name != null) {
        if (!first_name) return res.status(400).json({ ok: false, error: "Nombre inválido." });
        patch.first_name = first_name;
      }
      if (last_name != null) {
        if (!last_name) return res.status(400).json({ ok: false, error: "Apellido inválido." });
        patch.last_name = last_name;
      }

      const birth_day = req.body?.birth_day != null ? parseInt(String(req.body.birth_day ?? ""), 10) : null;
      const birth_month = req.body?.birth_month != null ? parseInt(String(req.body.birth_month ?? ""), 10) : null;
      const birth_year = req.body?.birth_year != null ? parseInt(String(req.body.birth_year ?? ""), 10) : null;
      const anyBirth = birth_day != null || birth_month != null || birth_year != null;
      if (anyBirth) {
        if (!Number.isFinite(birth_day) || birth_day < 1 || birth_day > 31) return res.status(400).json({ ok: false, error: "Día de nacimiento inválido." });
        if (!Number.isFinite(birth_month) || birth_month < 1 || birth_month > 12) return res.status(400).json({ ok: false, error: "Mes de nacimiento inválido." });
        const nowYear = new Date().getFullYear();
        if (!Number.isFinite(birth_year) || birth_year < 1900 || birth_year > nowYear) return res.status(400).json({ ok: false, error: "Año de nacimiento inválido." });
        const dob = new Date(Date.UTC(birth_year, birth_month - 1, birth_day));
        if (dob.getUTCFullYear() !== birth_year || dob.getUTCMonth() !== birth_month - 1 || dob.getUTCDate() !== birth_day) {
          return res.status(400).json({ ok: false, error: "Fecha de nacimiento inválida." });
        }
        patch.birth_day = birth_day;
        patch.birth_month = birth_month;
        patch.birth_year = birth_year;
        patch.birth_date = dob;
      }

      // name mostrado (fallback): si cambian nombre/apellido, recalcular
      if (patch.first_name != null || patch.last_name != null) {
        const row = await db.collection("store_users").findOne({ _id: u.id }, { projection: { first_name: 1, last_name: 1, email: 1 } });
        const fn = patch.first_name ?? row?.first_name ?? "";
        const ln = patch.last_name ?? row?.last_name ?? "";
        const email = row?.email ?? "";
        patch.name = `${String(fn).trim()} ${String(ln).trim()}`.trim() || String(email).split("@")[0] || "usuario";
      }

      if (Object.keys(patch).length === 0) return res.json({ ok: true });

      await db.collection("store_users").updateOne({ _id: u.id }, { $set: { ...patch, updatedAt: new Date() } });
      const updated = await db.collection("store_users").findOne(
        { _id: u.id },
        { projection: { email: 1, name: 1, role: 1, username: 1, first_name: 1, last_name: 1, birth_day: 1, birth_month: 1, birth_year: 1 } }
      );
      res.json({
        ok: true,
        user: updated
          ? {
              id: updated._id,
              email: updated.email,
              name: updated.name,
              role: updated.role,
              username: updated.username ?? null,
              first_name: updated.first_name ?? null,
              last_name: updated.last_name ?? null,
              birth_day: updated.birth_day ?? null,
              birth_month: updated.birth_month ?? null,
              birth_year: updated.birth_year ?? null,
            }
          : null,
      });
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
      const usernameRaw = String(req.body?.username || "").trim();
      const username = usernameRaw.toLowerCase();
      const first_name = String(req.body?.first_name || req.body?.firstName || "").trim();
      const last_name = String(req.body?.last_name || req.body?.lastName || "").trim();
      const birth_day = parseInt(String(req.body?.birth_day ?? ""), 10);
      const birth_month = parseInt(String(req.body?.birth_month ?? ""), 10);
      const birth_year = parseInt(String(req.body?.birth_year ?? ""), 10);
      const email = String(req.body?.email || "")
        .trim()
        .toLowerCase();
      const password = String(req.body?.password || "").trim();
      const password_confirm = String(req.body?.password_confirm || req.body?.passwordConfirm || "").trim();
      const name = `${first_name} ${last_name}`.trim() || email.split("@")[0] || "usuario";
      if (!email || !email.includes("@")) return res.status(400).json({ ok: false, error: "Email inválido." });
      if (password.length < 6) return res.status(400).json({ ok: false, error: "La contraseña debe tener al menos 6 caracteres." });
      if (password_confirm && password !== password_confirm) {
        return res.status(400).json({ ok: false, error: "Las contraseñas no coinciden." });
      }
      if (!username || username.length < 3) {
        return res.status(400).json({ ok: false, error: "Nombre de usuario inválido (mín. 3 caracteres)." });
      }
      if (!/^[a-z0-9_\\.\\-]+$/i.test(username)) {
        return res.status(400).json({ ok: false, error: "El nombre de usuario solo puede usar letras, números, guión, punto y guión bajo." });
      }
      if (!first_name || !last_name) {
        return res.status(400).json({ ok: false, error: "Ingresa nombre y apellido." });
      }
      if (!Number.isFinite(birth_day) || birth_day < 1 || birth_day > 31) {
        return res.status(400).json({ ok: false, error: "Día de nacimiento inválido." });
      }
      if (!Number.isFinite(birth_month) || birth_month < 1 || birth_month > 12) {
        return res.status(400).json({ ok: false, error: "Mes de nacimiento inválido." });
      }
      const nowYear = new Date().getFullYear();
      if (!Number.isFinite(birth_year) || birth_year < 1900 || birth_year > nowYear) {
        return res.status(400).json({ ok: false, error: "Año de nacimiento inválido." });
      }
      const dob = new Date(Date.UTC(birth_year, birth_month - 1, birth_day));
      if (dob.getUTCFullYear() !== birth_year || dob.getUTCMonth() !== birth_month - 1 || dob.getUTCDate() !== birth_day) {
        return res.status(400).json({ ok: false, error: "Fecha de nacimiento inválida." });
      }
      const exists = await db.collection("store_users").findOne({ email }, { projection: { _id: 1 } });
      if (exists) return res.status(409).json({ ok: false, error: "Ese email ya está registrado." });
      const existsUser = await db.collection("store_users").findOne({ username }, { projection: { _id: 1 } });
      if (existsUser) return res.status(409).json({ ok: false, error: "Ese nombre de usuario ya está en uso." });
      const id = await nextSeq(db, "user");
      const passHash = await bcrypt.hash(password, 10);
      await db.collection("store_users").insertOne({
        _id: id,
        username,
        first_name,
        last_name,
        birth_day,
        birth_month,
        birth_year,
        birth_date: dob,
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
      const loginId = String(req.body?.email || req.body?.emailOrUser || "")
        .trim();
      const email = loginId.toLowerCase();
      const password = String(req.body?.password || "").trim();
      if (!loginId || !password) return res.status(400).json({ ok: false, error: "Faltan credenciales." });
      const isEmail = loginId.includes("@");
      const row = await db.collection("store_users").findOne(isEmail ? { email } : { username: loginId.toLowerCase() });
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

  app.get("/api/store/products", async (req, res) => {
    try {
      const db = await getDb();
      const tag = req.query?.tag != null ? String(req.query.tag).trim().toLowerCase() : "";
      const limitRaw = req.query?.limit != null ? parseInt(String(req.query.limit), 10) : NaN;
      const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : null;

      const filter = { active: { $ne: 0 } };
      if (tag) {
        // productos guardan tags como array de slugs
        filter.tags = tag;
      }
      const products = await db
        .collection("products")
        .find(filter)
        .project({
          name: 1,
          description: 1,
          price_cents: 1,
          compare_price_cents: 1,
          stock: 1,
          image_url: 1,
          image_urls: 1,
          tags: 1,
        })
        .sort({ _id: 1 })
        .limit(limit ?? 200)
        .toArray();
      res.json({
        ok: true,
        products: products.map((p) => ({
          id: p._id,
          name: p.name,
          description: p.description || "",
          price_cents: p.price_cents || 0,
          compare_price_cents: typeof p.compare_price_cents === "number" ? p.compare_price_cents : null,
          stock: p.stock || 0,
          image_url: p.image_url ?? null,
          image_urls: Array.isArray(p.image_urls) ? p.image_urls : p.image_url ? [p.image_url] : [],
          tags: Array.isArray(p.tags) ? p.tags : [],
        })),
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/products/:id", async (req, res) => {
    try {
      const db = await getDb();
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ ok: false, error: "id inválido." });
      const row = await db.collection("products").findOne(
        { _id: id, active: { $ne: 0 } },
        {
          projection: {
            name: 1,
            description: 1,
            price_cents: 1,
            compare_price_cents: 1,
            stock: 1,
            image_url: 1,
            image_urls: 1,
            tags: 1,
          },
        }
      );
      if (!row) return res.status(404).json({ ok: false, error: "Producto no encontrado." });
      const image_urls = Array.isArray(row.image_urls) ? row.image_urls : row.image_url ? [row.image_url] : [];
      res.json({
        ok: true,
        product: {
          id: row._id,
          name: row.name,
          description: row.description || "",
          price_cents: row.price_cents || 0,
          compare_price_cents: typeof row.compare_price_cents === "number" ? row.compare_price_cents : null,
          stock: row.stock || 0,
          image_url: row.image_url ?? null,
          image_urls,
          tags: Array.isArray(row.tags) ? row.tags : [],
        },
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/bestsellers", async (req, res) => {
    try {
      const db = await getDb();
      const limit = Math.min(12, Math.max(1, parseInt(String(req.query?.limit ?? "4"), 10) || 4));
      const sinceDays = Math.min(365, Math.max(1, parseInt(String(req.query?.days ?? "30"), 10) || 30));
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

      const rows = await db
        .collection("store_orders")
        .aggregate([
          { $match: { createdAt: { $gte: since }, status: { $in: ["paid", "processing", "shipped", "completed"] } } },
          { $unwind: "$items" },
          {
            $group: {
              _id: "$items.product_id",
              units: { $sum: "$items.quantity" },
            },
          },
          { $sort: { units: -1 } },
          { $limit: limit },
          {
            $lookup: {
              from: "products",
              localField: "_id",
              foreignField: "_id",
              as: "p",
            },
          },
          { $unwind: "$p" },
          { $match: { "p.active": { $ne: 0 } } },
          {
            $project: {
              _id: 0,
              id: "$p._id",
              name: "$p.name",
              description: "$p.description",
              price_cents: "$p.price_cents",
              stock: "$p.stock",
              image_url: "$p.image_url",
              units: 1,
            },
          },
        ])
        .toArray();

      res.json({ ok: true, products: rows });
    } catch (e) {
      handleErr(res, e);
    }
  });

  // =========================
  // Checkout + Webpay
  // =========================
  app.post("/api/store/checkout/webpay/create", async (req, res) => {
    try {
      const u = await requireUser(req);
      const db = await getDb();

      const cart = await db
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
          { $match: { "p.active": { $ne: 0 } } },
          {
            $project: {
              product_id: 1,
              quantity: 1,
              name: "$p.name",
              price_cents: "$p.price_cents",
              stock: "$p.stock",
            },
          },
        ])
        .toArray();

      if (!cart.length) return res.status(400).json({ ok: false, error: "Carrito vacío." });

      // Validación básica de stock
      for (const it of cart) {
        const qty = parseInt(String(it.quantity ?? 0), 10);
        const stock = parseInt(String(it.stock ?? 0), 10);
        if (!Number.isFinite(qty) || qty < 1) return res.status(400).json({ ok: false, error: "Cantidad inválida en carrito." });
        if (!Number.isFinite(stock) || stock < qty) return res.status(409).json({ ok: false, error: `Sin stock para ${it.name}.` });
      }

      const total = cart.reduce((s, it) => s + (parseInt(String(it.price_cents ?? 0), 10) || 0) * (parseInt(String(it.quantity ?? 0), 10) || 0), 0);
      if (!Number.isFinite(total) || total < 50) return res.status(400).json({ ok: false, error: "Total inválido." });

      const orderId = await nextSeq(db, "order");
      const buyOrder = `O${orderId}`.slice(0, 26);
      const sessionId = `u${u.id}`.slice(0, 61);

      const base = resolvePublicBaseUrl(req);
      const returnUrl = `${base}/webpay/return`;

      const tx = makeWebpayTx();
      const createResp = await tx.create(buyOrder, sessionId, total, returnUrl);

      const now = new Date();
      await db.collection("store_orders").insertOne({
        _id: orderId,
        user_id: u.id,
        status: "pending_payment",
        currency: "CLP",
        total_cents: total,
        items: cart.map((it) => ({
          product_id: it.product_id,
          name: it.name,
          price_cents: it.price_cents,
          quantity: it.quantity,
        })),
        payment: {
          provider: "webpay",
          buyOrder,
          token: createResp?.token || null,
          url: createResp?.url || null,
        },
        createdAt: now,
        updatedAt: now,
      });

      res.json({
        ok: true,
        orderId,
        token: createResp?.token,
        url: createResp?.url,
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/checkout/webpay/commit", async (req, res) => {
    try {
      const u = await requireUser(req);
      const db = await getDb();
      const token = String(req.body?.token_ws || req.body?.token || "").trim();
      if (!token) return res.status(400).json({ ok: false, error: "Falta token_ws." });

      const order = await db.collection("store_orders").findOne({ "payment.provider": "webpay", "payment.token": token, user_id: u.id });
      if (!order) return res.status(404).json({ ok: false, error: "Orden no encontrada para este token." });

      const tx = makeWebpayTx();
      const commitResp = await tx.commit(token);

      const approved = String(commitResp?.status || "").toUpperCase() === "AUTHORIZED";
      const status = approved ? "paid" : "payment_failed";
      await db.collection("store_orders").updateOne(
        { _id: order._id },
        {
          $set: {
            status,
            "payment.commit": commitResp ?? null,
            updatedAt: new Date(),
          },
        }
      );

      // Si pagó, vaciamos carrito
      if (approved) {
        await db.collection("cart_items").deleteMany({ user_id: u.id });
      }

      res.json({ ok: true, approved, status, orderId: order._id, commit: commitResp ?? null });
    } catch (e) {
      handleErr(res, e);
    }
  });

  // =========================
  // Órdenes (cliente y admin)
  // =========================
  app.get("/api/store/orders", async (req, res) => {
    try {
      const u = await requireUser(req);
      const db = await getDb();
      const orders = await db
        .collection("store_orders")
        .find({ user_id: u.id })
        .project({ user_id: 0 })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray();
      res.json({ ok: true, orders });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/admin/orders", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const orders = await db
        .collection("store_orders")
        .find({})
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray();
      res.json({ ok: true, orders });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/admin/orders/:id", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ ok: false, error: "id inválido." });
      const order = await db.collection("store_orders").findOne({ _id: id });
      if (!order) return res.status(404).json({ ok: false, error: "Orden no encontrada." });
      const u = await db
        .collection("store_users")
        .findOne({ _id: order.user_id }, { projection: { email: 1, name: 1, role: 1 } });
      res.json({ ok: true, order, user: u ? { id: u._id, email: u.email, name: u.name, role: u.role } : null });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/admin/orders/:id/status", async (req, res) => {
    try {
      const admin = await requireAdmin(req);
      const db = await getDb();
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ ok: false, error: "id inválido." });
      const next = String(req.body?.status || "").trim();
      const allowed = new Set([
        "pending_payment",
        "paid",
        "processing",
        "shipped",
        "completed",
        "cancelled",
        "refunded",
        "payment_failed",
      ]);
      if (!allowed.has(next)) return res.status(400).json({ ok: false, error: "Estado inválido." });

      const now = new Date();
      await db.collection("store_orders").updateOne(
        { _id: id },
        {
          $set: { status: next, updatedAt: now },
          $push: {
            history: {
              at: now,
              by: { id: admin.id, email: admin.email, name: admin.name },
              status: next,
              note: String(req.body?.note || "").trim().slice(0, 500),
            },
          },
        }
      );
      const order = await db.collection("store_orders").findOne({ _id: id });
      res.json({ ok: true, order });
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
            .project({ name: 1, description: 1, price_cents: 1, compare_price_cents: 1, stock: 1, image_url: 1 })
            .toArray();
          const byId = new Map(data.map((p) => [p._id, p]));
          products = cfg.productIds.map((id) => byId.get(id)).filter(Boolean);
        } else {
          products = await db
            .collection("products")
            .find({ active: { $ne: 0 } })
            .project({ name: 1, description: 1, price_cents: 1, compare_price_cents: 1, stock: 1, image_url: 1 })
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
          compare_price_cents: typeof p.compare_price_cents === "number" ? p.compare_price_cents : null,
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
        .project({ name: 1, description: 1, price_cents: 1, compare_price_cents: 1, image_url: 1, stock: 1, active: 1, tags: 1 })
        .sort({ _id: 1 })
        .toArray();
      res.json({
        ok: true,
        products: rows.map((p) => ({
          id: p._id,
          name: p.name,
          description: p.description || "",
          price_cents: p.price_cents || 0,
          compare_price_cents: typeof p.compare_price_cents === "number" ? p.compare_price_cents : null,
          image_url: p.image_url ?? null,
          stock: p.stock || 0,
          active: p.active ? 1 : 0,
          tags: Array.isArray(p.tags) ? p.tags : [],
        })),
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/admin/products", optionalProductImagesUpload, async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const name = String(req.body?.name || "").trim();
      const description = String(req.body?.description || "").trim();
      const price_cents = parseInt(String(req.body?.price_cents), 10);
      const compare_price_cents =
        req.body?.compare_price_cents == null || String(req.body.compare_price_cents).trim() === ""
          ? null
          : parseInt(String(req.body.compare_price_cents), 10);
      const stock = parseInt(String(req.body?.stock ?? "0"), 10);
      if (!name) return res.status(400).json({ ok: false, error: "Nombre obligatorio." });
      if (!Number.isFinite(price_cents) || price_cents < 0) return res.status(400).json({ ok: false, error: "Precio inválido (price_cents)." });
      if (compare_price_cents != null && (!Number.isFinite(compare_price_cents) || compare_price_cents < 0))
        return res.status(400).json({ ok: false, error: "Precio anterior inválido (compare_price_cents)." });

      let tags = [];
      if (req.body?.tags_json != null && String(req.body.tags_json).trim() !== "") {
        try {
          const parsed = JSON.parse(String(req.body.tags_json));
          if (Array.isArray(parsed)) {
            tags = parsed.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 20);
          }
        } catch {
          return res.status(400).json({ ok: false, error: "tags_json inválido." });
        }
      }

      let image_urls = [];
      const files = Array.isArray(req.files) ? req.files : [];
      if (files.length > 0) {
        // construir URLs manualmente según la storage usada
        image_urls = files
          .map((f) => {
            if (f?.buffer && Buffer.isBuffer(f.buffer)) {
              const mime = f.mimetype || "image/jpeg";
              return `data:${mime};base64,${f.buffer.toString("base64")}`;
            }
            if (f?.filename) return `/store-media/products/${f.filename}`;
            return null;
          })
          .filter(Boolean);
      } else if (req.body?.image_url != null && String(req.body.image_url).trim() !== "") {
        const one = String(req.body.image_url).trim();
        image_urls = [one];
      }
      const image_url = image_urls[0] ?? null;
      const id = await nextSeq(db, "product");
      await db.collection("products").insertOne({
        _id: id,
        name,
        description,
        price_cents,
        compare_price_cents: compare_price_cents != null ? compare_price_cents : undefined,
        stock: Number.isFinite(stock) && stock >= 0 ? stock : 0,
        active: 1,
        image_url,
        image_urls,
        tags,
      });
      const product = await db.collection("products").findOne({ _id: id });
      res.json({
        ok: true,
        product: {
          id: product._id,
          name: product.name,
          description: product.description || "",
          price_cents: product.price_cents,
          compare_price_cents: typeof product.compare_price_cents === "number" ? product.compare_price_cents : null,
          image_url: product.image_url ?? null,
          image_urls: Array.isArray(product.image_urls) ? product.image_urls : product.image_url ? [product.image_url] : [],
          stock: product.stock,
          active: product.active ? 1 : 0,
          tags: Array.isArray(product.tags) ? product.tags : [],
        },
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.patch("/api/store/admin/products/:id", optionalProductImagesUpload, async (req, res) => {
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
      if (req.body?.compare_price_cents !== undefined) {
        const raw = req.body.compare_price_cents;
        if (raw === null || raw === "") {
          $set.compare_price_cents = null;
        } else {
          const v = parseInt(String(raw), 10);
          if (!Number.isFinite(v) || v < 0) return res.status(400).json({ ok: false, error: "Precio anterior inválido." });
          $set.compare_price_cents = v;
        }
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

      if (req.body?.tags_json !== undefined) {
        if (req.body.tags_json === null || req.body.tags_json === "") {
          $set.tags = [];
        } else {
          try {
            const parsed = JSON.parse(String(req.body.tags_json));
            if (!Array.isArray(parsed)) return res.status(400).json({ ok: false, error: "tags_json inválido." });
            $set.tags = parsed.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 20);
          } catch {
            return res.status(400).json({ ok: false, error: "tags_json inválido." });
          }
        }
      }

      const files = Array.isArray(req.files) ? req.files : [];
      if (files.length > 0) {
        const newUrls = files
          .map((f) => {
            if (f?.buffer && Buffer.isBuffer(f.buffer)) {
              const mime = f.mimetype || "image/jpeg";
              return `data:${mime};base64,${f.buffer.toString("base64")}`;
            }
            if (f?.filename) return `/store-media/products/${f.filename}`;
            return null;
          })
          .filter(Boolean);
        const prev = Array.isArray(prevRow.image_urls) ? prevRow.image_urls : prevRow.image_url ? [prevRow.image_url] : [];
        const merged = [...prev, ...newUrls].filter(Boolean).slice(0, 10);
        $set.image_urls = merged;
        $set.image_url = merged[0] ?? null;
      } else if (req.body?.clear_image === true || req.body?.clear_image === "1") {
        // compat: limpiar todas las imágenes
        const prev = Array.isArray(prevRow.image_urls) ? prevRow.image_urls : prevRow.image_url ? [prevRow.image_url] : [];
        for (const u of prev) deleteStoredImageFile(uploadRoot, u);
        $set.image_url = null;
        $set.image_urls = [];
      } else if (req.body?.image_url !== undefined && !req.file) {
        const raw = req.body.image_url;
        if (raw === null || raw === "") {
          const prev = Array.isArray(prevRow.image_urls) ? prevRow.image_urls : prevRow.image_url ? [prevRow.image_url] : [];
          for (const u of prev) deleteStoredImageFile(uploadRoot, u);
          $set.image_url = null;
          $set.image_urls = [];
        } else {
          $set.image_url = String(raw).trim();
          $set.image_urls = [String(raw).trim()];
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
          compare_price_cents: typeof product.compare_price_cents === "number" ? product.compare_price_cents : null,
          image_url: product.image_url ?? null,
          image_urls: Array.isArray(product.image_urls) ? product.image_urls : product.image_url ? [product.image_url] : [],
          stock: product.stock,
          active: product.active ? 1 : 0,
          tags: Array.isArray(product.tags) ? product.tags : [],
        },
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.delete("/api/store/admin/products/:id", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ ok: false, error: "id inválido." });
      const prevRow = await db.collection("products").findOne({ _id: id });
      if (!prevRow) return res.status(404).json({ ok: false, error: "Producto no encontrado." });

      if (prevRow.image_url) deleteStoredImageFile(uploadRoot, prevRow.image_url);
      await db.collection("products").deleteOne({ _id: id });
      await db.collection("cart_items").deleteMany({ product_id: id });
      res.json({ ok: true });
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

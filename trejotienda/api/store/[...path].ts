import bcrypt from "bcryptjs";
import { clearSessionCookie, json, makeSessionCookie, readJson, readSession } from "../_lib/http";
import { ADMIN_EMAIL, ADMIN_PASSWORD, BOOTSTRAP_TOKEN } from "../_lib/env";
import { mongoDb } from "../_lib/mongo";
import { ObjectId } from "mongodb";

function pathParts(req: any): string[] {
  const p = req.query?.path;
  if (Array.isArray(p)) return p.map(String);
  if (typeof p === "string" && p) return [p];
  return [];
}

function requireUser(req: any) {
  const s = readSession(req);
  if (!s) throw new Error("No autenticado.");
  return s;
}

function requireAdmin(req: any) {
  const s = requireUser(req);
  if (!s.admin) throw new Error("No autorizado.");
  return s;
}

export default async function handler(req: any, res: any) {
  const parts = pathParts(req);
  const route = parts.join("/");
  const db = await mongoDb();

  try {
    // --- Bootstrap admin (one-time / protegido por token) ---
    // POST /api/store/bootstrap-admin  header: x-bootstrap-token
    if (route === "bootstrap-admin" && req.method === "POST") {
      const token = String(req.headers?.["x-bootstrap-token"] || "").trim();
      if (!token || token !== BOOTSTRAP_TOKEN()) return json(res, 401, { ok: false, error: "Token inválido." });

      const email = ADMIN_EMAIL().toLowerCase();
      const password = ADMIN_PASSWORD();
      if (password.length < 6) return json(res, 400, { ok: false, error: "ADMIN_PASSWORD muy corta (mín 6)." });

      const count = await db.collection("store_users").countDocuments({});
      if (count > 0) return json(res, 409, { ok: false, error: "Ya existen usuarios. Bootstrap bloqueado." });

      const passHash = await bcrypt.hash(password, 10);
      const r = await db.collection("store_users").insertOne({
        email,
        name: "admin",
        role: "admin",
        pass_hash: passHash,
        createdAt: new Date(),
      });
      return json(res, 200, { ok: true, user: { id: String(r.insertedId), email, name: "admin", role: "admin" } });
    }

    // --- Auth ---
    if (route === "me" && req.method === "GET") {
      const s = readSession(req);
      if (!s) return json(res, 200, { user: null });
      let oid: ObjectId | null = null;
      try {
        oid = new ObjectId(String(s.uid));
      } catch {
        return json(res, 200, { user: null });
      }
      const u: any = await db.collection("store_users").findOne({ _id: oid }, { projection: { email: 1, name: 1, role: 1 } });
      if (!u) return json(res, 200, { user: null });
      return json(res, 200, { user: { id: String(u._id), email: u.email, name: u.name, role: u.role } });
    }

    if (route === "logout" && req.method === "POST") {
      return json(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
    }

    if (route === "register" && req.method === "POST") {
      const body = await readJson(req);
      const email = String(body?.email || "").trim().toLowerCase();
      const password = String(body?.password || "");
      const name = String(body?.name || "").trim() || email.split("@")[0] || "usuario";
      if (!email || !email.includes("@")) return json(res, 400, { ok: false, error: "Email inválido." });
      if (password.length < 4) return json(res, 400, { ok: false, error: "Contraseña muy corta." });
      const exists = await db.collection("store_users").findOne({ email }, { projection: { _id: 1 } });
      if (exists) return json(res, 400, { ok: false, error: "Ya existe ese email." });
      const passHash = await bcrypt.hash(password, 10);
      const r = await db.collection("store_users").insertOne({
        email,
        name,
        role: "customer",
        pass_hash: passHash,
        createdAt: new Date(),
      });
      return json(res, 200, { ok: true, user: { id: String(r.insertedId), email, name, role: "customer" } });
    }

    if (route === "login" && req.method === "POST") {
      const body = await readJson(req);
      const emailOrUser = String(body?.emailOrUser || body?.email || "").trim().toLowerCase();
      const password = String(body?.password || "");
      if (!emailOrUser || !password) return json(res, 400, { ok: false, error: "Faltan credenciales." });
      const data: any = await db.collection("store_users").findOne({ email: emailOrUser });
      if (!data?.pass_hash) return json(res, 401, { ok: false, error: "Credenciales inválidas." });
      const ok = await bcrypt.compare(password, String(data.pass_hash));
      if (!ok) return json(res, 401, { ok: false, error: "Credenciales inválidas." });
      const cookie = makeSessionCookie({ uid: String(data._id), admin: data.role === "admin" }, 60 * 60 * 24 * 14);
      const user = { id: String(data._id), email: data.email, name: data.name, role: data.role };
      return json(res, 200, { ok: true, user }, { "Set-Cookie": cookie });
    }

    // --- Store public ---
    if (route === "products" && req.method === "GET") {
      const products = await db
        .collection("products")
        .find({ active: { $ne: false } })
        .project({ name: 1, description: 1, price_cents: 1, stock: 1, image_url: 1 })
        .sort({ _id: 1 })
        .toArray();
      return json(res, 200, {
        products: products.map((p: any) => ({
          id: String(p._id),
          name: p.name,
          description: p.description || "",
          price_cents: p.price_cents || 0,
          stock: p.stock || 0,
          image_url: p.image_url ?? null,
        })),
      });
    }

    if (route === "carousel" && req.method === "GET") {
      const defaults = { enabled: true, autoMs: 6000, maxSlides: 6, productIds: [] as number[] };
      const w: any = await db.collection("store_widgets").findOne({ widget_id: "carousel_home" });
      let cfg = { ...defaults };
      try {
        if (w?.config_json) {
          const j = typeof w.config_json === "string" ? JSON.parse(w.config_json) : w.config_json;
          cfg.enabled = j?.enabled !== false;
          cfg.autoMs = Number.isFinite(j?.autoMs) ? Math.max(0, Math.min(120000, j.autoMs)) : defaults.autoMs;
          // Para Mongo usamos ids string (ObjectId) en productIds
          const ids = Array.isArray(j?.productIds) ? j.productIds.map((x: any) => String(x)).filter(Boolean) : [];
          (cfg as any).productIds = [...new Set(ids)].slice(0, defaults.maxSlides);
        }
      } catch {
        /* ignore */
      }
      let products: any[] = [];
      const ids = (cfg as any).productIds as string[] | undefined;
      if (ids && ids.length > 0) {
        const oids = ids
          .map((s) => {
            try {
              return new ObjectId(s);
            } catch {
              return null;
            }
          })
          .filter(Boolean) as ObjectId[];
        const data = await db
          .collection("products")
          .find({ _id: { $in: oids }, active: { $ne: false } })
          .project({ name: 1, description: 1, price_cents: 1, stock: 1, image_url: 1 })
          .toArray();
        const byId = new Map(data.map((p: any) => [String(p._id), p]));
        products = ids.map((id) => byId.get(id)).filter(Boolean);
      } else {
        products = await db
          .collection("products")
          .find({ active: { $ne: false } })
          .project({ name: 1, description: 1, price_cents: 1, stock: 1, image_url: 1 })
          .sort({ _id: 1 })
          .limit(6)
          .toArray();
      }
      return json(res, 200, {
        enabled: cfg.enabled,
        autoMs: cfg.autoMs,
        products: products.map((p: any) => ({
          id: String(p._id),
          name: p.name,
          description: p.description || "",
          price_cents: p.price_cents || 0,
          stock: p.stock || 0,
          image_url: p.image_url ?? null,
        })),
      });
    }

    // --- Standings overrides admin ---
    if (route === "admin/tournament-deck-overrides" && req.method === "GET") {
      requireAdmin(req);
      const data = await db
        .collection("tournament_deck_overrides")
        .find({})
        .project({ _id: 0, k: 1, entry: 1 })
        .toArray();
      const overrides = Object.fromEntries((data || []).map((r: any) => [r.k, r.entry]));
      return json(res, 200, { ok: true, overrides });
    }

    if (route === "admin/tournament-deck-overrides" && req.method === "PATCH") {
      requireAdmin(req);
      const body = await readJson(req);
      const key = String(body?.key || "").trim();
      if (!key) return json(res, 400, { ok: false, error: "Falta key." });
      const entry = body?.entry ?? null;
      if (entry === null) {
        await db.collection("tournament_deck_overrides").deleteOne({ k: key });
      } else {
        await db.collection("tournament_deck_overrides").updateOne(
          { k: key },
          { $set: { k: key, entry, updatedAt: new Date() } },
          { upsert: true }
        );
      }
      const all = await db
        .collection("tournament_deck_overrides")
        .find({})
        .project({ _id: 0, k: 1, entry: 1 })
        .toArray();
      const overrides = Object.fromEntries((all || []).map((r: any) => [r.k, r.entry]));
      return json(res, 200, { ok: true, key, entry: entry, overrides });
    }

    return json(res, 404, { ok: false, error: `No existe /api/store/${route}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = msg.includes("autoriz") ? 403 : msg.includes("autentic") ? 401 : 400;
    return json(res, code, { ok: false, error: msg });
  }
}


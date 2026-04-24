import bcrypt from "bcryptjs";
import { clearSessionCookie, json, makeSessionCookie, readJson, readSession } from "../_lib/http";
import { supabaseAdmin } from "../_lib/supabase";

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
  const sb = supabaseAdmin();

  try {
    // --- Auth ---
    if (route === "me" && req.method === "GET") {
      const s = readSession(req);
      if (!s) return json(res, 200, { user: null });
      const { data, error } = await sb
        .from("store_users")
        .select("id,email,name,role")
        .eq("id", parseInt(String(s.uid), 10))
        .maybeSingle();
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { user: data || null });
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
      const passHash = await bcrypt.hash(password, 10);
      const { data, error } = await sb
        .from("store_users")
        .insert({ email, name, pass_hash: passHash, role: "customer" })
        .select("id,email,name,role")
        .single();
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true, user: data });
    }

    if (route === "login" && req.method === "POST") {
      const body = await readJson(req);
      const emailOrUser = String(body?.emailOrUser || body?.email || "").trim().toLowerCase();
      const password = String(body?.password || "");
      if (!emailOrUser || !password) return json(res, 400, { ok: false, error: "Faltan credenciales." });
      const { data, error } = await sb
        .from("store_users")
        .select("id,email,name,role,pass_hash")
        .eq("email", emailOrUser)
        .maybeSingle();
      if (error) return json(res, 500, { ok: false, error: error.message });
      if (!data?.pass_hash) return json(res, 401, { ok: false, error: "Credenciales inválidas." });
      const ok = await bcrypt.compare(password, String(data.pass_hash));
      if (!ok) return json(res, 401, { ok: false, error: "Credenciales inválidas." });
      const cookie = makeSessionCookie({ uid: String(data.id), admin: data.role === "admin" }, 60 * 60 * 24 * 14);
      const user = { id: data.id, email: data.email, name: data.name, role: data.role };
      return json(res, 200, { ok: true, user }, { "Set-Cookie": cookie });
    }

    // --- Store public ---
    if (route === "products" && req.method === "GET") {
      const { data, error } = await sb
        .from("products")
        .select("id,name,description,price_cents,stock,image_url")
        .eq("active", true)
        .order("id", { ascending: true });
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { products: data || [] });
    }

    if (route === "carousel" && req.method === "GET") {
      const defaults = { enabled: true, autoMs: 6000, maxSlides: 6, productIds: [] as number[] };
      const { data: w } = await sb.from("store_widgets").select("config_json").eq("widget_id", "carousel_home").maybeSingle();
      let cfg = { ...defaults };
      try {
        if (w?.config_json) {
          const j = typeof w.config_json === "string" ? JSON.parse(w.config_json) : w.config_json;
          cfg.enabled = j?.enabled !== false;
          cfg.autoMs = Number.isFinite(j?.autoMs) ? Math.max(0, Math.min(120000, j.autoMs)) : defaults.autoMs;
          const ids = Array.isArray(j?.productIds) ? j.productIds.map((x: any) => parseInt(String(x), 10)).filter((n: any) => Number.isFinite(n) && n > 0) : [];
          cfg.productIds = [...new Set(ids)].slice(0, defaults.maxSlides);
        }
      } catch {
        /* ignore */
      }
      let products: any[] = [];
      if (cfg.productIds.length > 0) {
        const { data } = await sb
          .from("products")
          .select("id,name,description,price_cents,stock,image_url")
          .in("id", cfg.productIds)
          .eq("active", true);
        // mantener orden
        const byId = new Map((data || []).map((p: any) => [p.id, p]));
        products = cfg.productIds.map((id) => byId.get(id)).filter(Boolean);
      } else {
        const { data } = await sb
          .from("products")
          .select("id,name,description,price_cents,stock,image_url")
          .eq("active", true)
          .order("id", { ascending: true })
          .limit(6);
        products = data || [];
      }
      return json(res, 200, { enabled: cfg.enabled, autoMs: cfg.autoMs, products });
    }

    // --- Standings overrides admin ---
    if (route === "admin/tournament-deck-overrides" && req.method === "GET") {
      requireAdmin(req);
      const { data, error } = await sb.from("tournament_deck_overrides").select("k,entry");
      if (error) return json(res, 500, { ok: false, error: error.message });
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
        const { error } = await sb.from("tournament_deck_overrides").delete().eq("k", key);
        if (error) return json(res, 500, { ok: false, error: error.message });
      } else {
        const { error } = await sb.from("tournament_deck_overrides").upsert({ k: key, entry }, { onConflict: "k" });
        if (error) return json(res, 500, { ok: false, error: error.message });
      }
      const { data: all } = await sb.from("tournament_deck_overrides").select("k,entry");
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


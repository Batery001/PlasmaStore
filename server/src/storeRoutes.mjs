import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import multer from "multer";
import { ObjectId } from "mongodb";
import { Environment, IntegrationApiKeys, IntegrationCommerceCodes, Options, WebpayPlus } from "transbank-sdk";
import { nextSeq } from "./counters.mjs";
import { clearSessionCookie, makeGuestCookie, makeSessionCookie, newGuestId, readGuestId, readSession } from "./session.mjs";
import {
  RESERVATION_TTL_MS,
  STOCK_GONE_MSG,
  assertOrderReservationsOk,
  availableForWeb,
  availableForWebFromMap,
  breakReservationsForProducts,
  consumeReservationsForOrder,
  createReservationsForOrder,
  expireReservations,
  isWebSellable,
  normalizeSalesChannel,
  releaseReservationsForOrder,
  reservedQtyMap,
} from "./stockReservations.mjs";
import {
  publicPaymentSettingsView,
  readPaymentSettings,
  savePaymentSettings,
} from "./paymentSettings.mjs";
import {
  buildTuuPayload,
  collectTuuParams,
  isHttpsUrl,
  normalizePhoneCl,
  requestTuuPaymentUrl,
  resolveTuuCredentials,
  signTuuParams,
  signaturesMatch,
  splitCustomerName,
  tuuResultApproved,
  tuuResultFailed,
} from "./tuuCheckout.mjs";
import { mountAccountMailRoutes, sendEventPlayerFormMails, sendOrderAdminNotify, sendOrderReceipt, sendOrderStatusUpdate } from "./accountMailRoutes.mjs";
import { mountDeckRoutes } from "./pokemon/deckRoutes.mjs";
import { sendMail } from "./mailer.mjs";
import { passwordValidationError } from "./passwordRules.mjs";
import { clientKey, rateLimit } from "./rateLimit.mjs";
import { parseProductPosFields, publicAdminProduct } from "./productPosFields.mjs";
import { effectiveLinePricing } from "./productPricing.mjs";
import { readShippingSettings, saveShippingSettings } from "./shippingSettings.mjs";
import { publicSiteContent, readSiteContent, saveSiteContent, findEventById } from "./siteContentSettings.mjs";
import { eventGameTagLabel } from "./eventGameTags.mjs";
import { eventMinAge, eventNeedsDecklist, mylRaceLabel, parseMylRace } from "./eventFormats.mjs";
import {
  eventNeedsPlayerForm,
  missingUserFieldsFromPlayer,
  normalizeMylCl,
  normalizePopid,
  parseDecklist,
  parseEventPlayer,
  parseGuardian,
  playerSnapshotFromReg,
} from "./eventPlayer.mjs";
import {
  assertUserCanTakeEventCup,
  canCustomerCancelRegistration,
  eventFormIsComplete,
  findDuplicatePlayerCode,
  formDeadlineMs,
  playerAgeAt,
  playerDataEditable,
  playerFormOpen,
  playerNeedsGuardian,
  playerRaceEditable,
  releaseEventRegistration,
} from "./eventRules.mjs";
import {
  buildEventTermsText,
  eventAvailability,
  eventHasStarted,
  expireStartedEventSales,
  expireUnpaidEventRegistrations,
  isEventProduct,
  recordPaidEventCupsFromOrder,
} from "./eventRegistrations.mjs";
import { createAuthToken, consumeAuthToken } from "./authTokens.mjs";
import { assertValidRut } from "./rut.mjs";
import { ageFromBirth, readStoreOps, saveStoreOps } from "./storeOpsSettings.mjs";
import { generateTotpSecret, totpOtpauthUrl, verifyTotp } from "./totp.mjs";
import { boletaHtml, issueBoletaForOrder } from "./boleta.mjs";
import { getDbDriver } from "./db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
 * @param {any} db
 * @param {{ product_id: number, delta: number, reason: string, note?: string, order_id?: number|null, by?: any, stock_after?: number }} mov
 */
async function recordStockMovement(db, mov) {
  const id = await nextSeq(db, "stock_movement");
  await db.collection("stock_movements").insertOne({
    _id: id,
    product_id: mov.product_id,
    delta: mov.delta,
    reason: String(mov.reason || "ajuste").slice(0, 40),
    note: String(mov.note || "").slice(0, 300) || null,
    order_id: mov.order_id ?? null,
    by: mov.by || null,
    stock_after: typeof mov.stock_after === "number" ? mov.stock_after : null,
    createdAt: new Date(),
  });
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
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
  const LANDING_DIR = path.join(uploadRoot, "landing");
  const SHIPPING_PROOFS_DIR = path.join(uploadRoot, "shipping-proofs");
  if (!IS_VERCEL) {
    try {
      fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
    } catch {
      /* ignore */
    }
    try {
      fs.mkdirSync(LANDING_DIR, { recursive: true });
    } catch {
      /* ignore */
    }
    try {
      fs.mkdirSync(SHIPPING_PROOFS_DIR, { recursive: true });
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

  const uploadLandingImage = multer({
    storage: IS_VERCEL
      ? multer.memoryStorage()
      : multer.diskStorage({
          destination: (_req, _file, cb) => cb(null, LANDING_DIR),
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

  const uploadShippingProof = multer({
    storage: IS_VERCEL
      ? multer.memoryStorage()
      : multer.diskStorage({
          destination: (_req, _file, cb) => cb(null, SHIPPING_PROOFS_DIR),
          filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname || "").toLowerCase();
            const ok = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".pdf"];
            const e = ok.includes(ext) ? ext : ".jpg";
            cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 12)}${e}`);
          },
        }),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (/^image\/(jpeg|png|gif|webp|avif)$/i.test(file.mimetype) || file.mimetype === "application/pdf") {
        cb(null, true);
      } else {
        cb(new Error("Solo imágenes (JPEG, PNG, GIF, WebP, AVIF) o PDF."));
      }
    },
  });

  function shippingProofUrl(file) {
    if (!file) return null;
    if (file.buffer && Buffer.isBuffer(file.buffer)) {
      const mime = file.mimetype || "application/octet-stream";
      return `data:${mime};base64,${file.buffer.toString("base64")}`;
    }
    if (file.filename) return `/store-media/shipping-proofs/${file.filename}`;
    return null;
  }

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
    const u = await db.collection("store_users").findOne(
      { _id: uid },
      { projection: { email: 1, name: 1, role: 1, deleted_at: 1, rut: 1, rut_normalized: 1 } }
    );
    if (!u || u.deleted_at) throw Object.assign(new Error("No autenticado."), { status: 401 });
    return {
      id: u._id,
      email: u.email,
      name: u.name,
      role: u.role,
      admin: u.role === "admin",
      rut: u.rut ?? null,
      rut_normalized: u.rut_normalized ?? null,
    };
  }

  function publicUserPayload(u) {
    if (!u) return null;
    return {
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
      rut: u.rut ?? null,
      popid: u.popid ?? null,
      myl_cl: u.myl_cl ?? null,
      email_verified: u.email_verified === true || u.role === "admin",
    };
  }

  async function assertRutAvailable(db, clean, excludeUserId = null) {
    const filter = {
      rut_normalized: clean,
      $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }],
    };
    if (excludeUserId != null) filter._id = { $ne: excludeUserId };
    const exists = await db.collection("store_users").findOne(filter, { projection: { _id: 1 } });
    if (exists) {
      throw Object.assign(new Error("Ese RUT ya está registrado en otra cuenta."), { status: 409 });
    }
  }

  async function requireAdmin(req) {
    const u = await requireUser(req);
    if (u.role !== "admin") throw Object.assign(new Error("Solo administradores."), { status: 403 });
    return u;
  }

  /** Usuario logueado o invitado (cookie ps_guest). */
  async function resolveCartActor(req, res) {
    try {
      const u = await requireUser(req);
      return { kind: "user", userId: u.id, user: u, guestId: null };
    } catch {
      let gid = readGuestId(req);
      if (!gid) {
        gid = newGuestId();
        res.append("Set-Cookie", makeGuestCookie(gid));
      }
      return { kind: "guest", userId: null, user: null, guestId: gid };
    }
  }

  function cartMatch(actor) {
    if (actor.kind === "user") return { user_id: actor.userId };
    return { guest_id: actor.guestId };
  }

  function cartMatchFromOrder(order) {
    if (order?.user_id) return { user_id: order.user_id };
    if (order?.guest_id) return { guest_id: order.guest_id };
    return null;
  }

  /**
   * Marca una orden pagada (idempotente): stock, boleta, mails, carrito.
   * @param {any} db
   * @param {any} order
   * @param {any} extraSet
   */
  async function settleApprovedOrder(db, order, extraSet = {}) {
    const now = new Date();
    let inventoryApplied = false;
    let inventoryWarning = null;

    if (order.status === "paid" && (order.inventory_applied || order.channel === "event" || order.event_registration_id)) {
      return { inventoryApplied: true, inventoryWarning: null, alreadySettled: true };
    }

    await db.collection("store_orders").updateOne(
      { _id: order._id },
      { $set: { status: "paid", updatedAt: now, ...extraSet } }
    );

    if (order.channel === "event" || order.event_registration_id) {
      inventoryApplied = true;
      await db.collection("store_orders").updateOne(
        { _id: order._id },
        { $set: { inventory_applied: true, inventory_applied_at: now, updatedAt: now } }
      );
      if (order.event_registration_id) {
        await db.collection("event_registrations").updateOne(
          { _id: order.event_registration_id, status: { $in: ["pending_payment", "pending_store_payment"] } },
          { $set: { status: "paid", paid_at: now, updatedAt: now } }
        );
      }
      try {
        await issueBoletaForOrder(db, order);
      } catch {
        /* ignore */
      }
      const paidOrder = await db.collection("store_orders").findOne({ _id: order._id });
      try {
        await sendOrderReceipt(db, paidOrder);
      } catch {
        /* ignore */
      }
      try {
        await sendOrderAdminNotify(db, paidOrder);
      } catch {
        /* ignore */
      }
      return { inventoryApplied, inventoryWarning, alreadySettled: false };
    }

    const fresh = await db.collection("store_orders").findOne(
      { _id: order._id },
      { projection: { items: 1, inventory_applied: 1, stock_conflict: 1, stock_conflict_msg: 1 } }
    );
    if (fresh?.inventory_applied) {
      inventoryApplied = true;
    } else {
      const reserveCheck = await assertOrderReservationsOk(db, { _id: order._id, items: fresh?.items });
      if (!reserveCheck.ok || fresh?.stock_conflict) {
        inventoryWarning = fresh?.stock_conflict_msg || reserveCheck.error || STOCK_GONE_MSG;
        await releaseReservationsForOrder(db, order._id, "failed_after_pay");
        await db.collection("store_orders").updateOne(
          { _id: order._id },
          {
            $set: {
              inventory_applied: false,
              inventory_error: inventoryWarning,
              needs_manual_review: true,
              updatedAt: now,
            },
          }
        );
      } else {
        const items = Array.isArray(fresh?.items) ? fresh.items : [];
        /** @type {Array<{ product_id: number, quantity: number }>} */
        const touched = [];
        try {
          for (const it of items) {
            const pid = parseInt(String(it?.product_id ?? 0), 10);
            const qty = parseInt(String(it?.quantity ?? 0), 10);
            if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(qty) || qty < 1) continue;

            const r = await db.collection("products").updateOne(
              { _id: pid, active: { $ne: 0 }, stock: { $gte: qty } },
              { $inc: { stock: -qty }, $set: { updatedAt: now } }
            );
            if (!r?.modifiedCount) {
              throw Object.assign(new Error(STOCK_GONE_MSG), { code: "STOCK_RACE", product_id: pid });
            }
            touched.push({ product_id: pid, quantity: qty });
          }

          await consumeReservationsForOrder(db, order._id);
          for (const t of touched) {
            const prod = await db.collection("products").findOne({ _id: t.product_id }, { projection: { stock: 1 } });
            await recordStockMovement(db, {
              product_id: t.product_id,
              delta: -t.quantity,
              reason: "venta_web",
              order_id: order._id,
              stock_after: Math.max(0, parseInt(String(prod?.stock ?? 0), 10) || 0),
            });
          }
          await db.collection("store_orders").updateOne(
            { _id: order._id },
            { $set: { inventory_applied: true, inventory_applied_at: now, updatedAt: now } }
          );
          inventoryApplied = true;
        } catch (e) {
          for (const t of touched) {
            try {
              await db.collection("products").updateOne(
                { _id: t.product_id },
                { $inc: { stock: t.quantity }, $set: { updatedAt: now } }
              );
            } catch {
              /* ignore */
            }
          }
          inventoryWarning = e instanceof Error ? e.message : STOCK_GONE_MSG;
          await releaseReservationsForOrder(db, order._id, "inventory_failed");
          await db.collection("store_orders").updateOne(
            { _id: order._id },
            {
              $set: {
                inventory_applied: false,
                inventory_error: inventoryWarning,
                needs_manual_review: true,
                updatedAt: now,
              },
            }
          );
        }
      }
    }

    if (inventoryApplied) {
      try {
        await issueBoletaForOrder(db, order);
      } catch {
        /* ignore */
      }
      const match = cartMatchFromOrder(order);
      if (match) {
        await db.collection("cart_items").deleteMany(match);
      }
      const paidOrder = await db.collection("store_orders").findOne({ _id: order._id });
      const orderForMail = paidOrder || order;
      try {
        const mailRes = await sendOrderReceipt(db, orderForMail);
        if (mailRes?.ok) {
          await db.collection("store_orders").updateOne(
            { _id: order._id },
            { $set: { receipt_email_sent: true, receipt_email_at: now } }
          );
        } else if (!mailRes?.skipped) {
          await db.collection("store_orders").updateOne(
            { _id: order._id },
            { $set: { receipt_email_sent: false, receipt_email_error: mailRes?.error || "fail", updatedAt: now } }
          );
        }
      } catch (mailErr) {
        console.warn("[receipt]", mailErr instanceof Error ? mailErr.message : mailErr);
      }
      try {
        const notifyRes = await sendOrderAdminNotify(db, orderForMail);
        if (notifyRes?.ok) {
          await db.collection("store_orders").updateOne(
            { _id: order._id },
            { $set: { admin_notify_sent: true, admin_notify_at: now, updatedAt: now } }
          );
        } else if (!notifyRes?.skipped) {
          await db.collection("store_orders").updateOne(
            { _id: order._id },
            { $set: { admin_notify_sent: false, admin_notify_error: notifyRes?.error || "fail", updatedAt: now } }
          );
        }
      } catch (notifyErr) {
        console.warn("[admin-notify]", notifyErr instanceof Error ? notifyErr.message : notifyErr);
      }
    }

    if (inventoryApplied) {
      const settledEvent = await db.collection("store_orders").findOne({ _id: order._id });
      if (settledEvent && !settledEvent.event_cups_recorded) {
        await recordPaidEventCupsFromOrder(db, settledEvent);
        await db.collection("store_orders").updateOne(
          { _id: order._id },
          { $set: { event_cups_recorded: true, updatedAt: now } }
        );
      }
    }

    return { inventoryApplied, inventoryWarning, alreadySettled: false };
  }

  async function failPendingOrder(db, order, reason) {
    const now = new Date();
    if (order.status === "paid") return;
    if (order.channel !== "event" && !order.event_registration_id) {
      await releaseReservationsForOrder(db, order._id, reason || "payment_failed");
    } else if (order.event_registration_id) {
      await db.collection("event_registrations").updateOne(
        { _id: order.event_registration_id, status: "pending_payment" },
        { $set: { status: "cancelled", cancel_reason: reason || "payment_failed", updatedAt: now } }
      );
    }
    await db.collection("store_orders").updateOne(
      { _id: order._id, status: { $ne: "paid" } },
      { $set: { status: "payment_failed", updatedAt: now, "payment.fail_reason": reason || "payment_failed" } }
    );
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

  /**
   * Crea etiquetas faltantes y devuelve slugs únicos.
   * Acepta nombres o slugs (ej. "Pokémon" o "pokemon").
   * @param {any} db
   * @param {unknown[]} labels
   */
  async function ensureStoreTags(db, labels) {
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(labels) ? labels : []) {
      const text = String(raw || "").trim();
      if (!text) continue;
      const slug = slugify(text);
      if (!slug) continue;
      if (seen.has(slug)) continue;

      let row = await db.collection("store_tags").findOne({ slug });
      if (!row) {
        row = await db.collection("store_tags").findOne({ name: text });
      }
      if (!row) {
        // match case-insensitive name via scan (sqlite local)
        const all = await db.collection("store_tags").find({}).project({ name: 1, slug: 1 }).toArray();
        row =
          all.find((t) => slugify(t.name) === slug || String(t.slug) === slug) ||
          null;
      }
      if (!row) {
        const id = await nextSeq(db, "tag");
        const now = new Date();
        const maxOrder = await db.collection("store_tags").find({}).project({ order: 1 }).toArray();
        const order =
          maxOrder.reduce((m, t) => Math.max(m, Number(t.order) || 0), 0) + 1;
        await db.collection("store_tags").insertOne({
          _id: id,
          name: text,
          slug,
          order,
          active: 1,
          createdAt: now,
          updatedAt: now,
        });
        row = { _id: id, name: text, slug };
      }
      seen.add(row.slug);
      out.push(String(row.slug));
    }
    return out.slice(0, 30);
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

  async function makeWebpayTx(db) {
    const cfg = db ? await readPaymentSettings(db) : await readPaymentSettings(await getDb());
    const mode = cfg.mode;
    const isIntegration = mode === "integration";
    const isProduction = mode === "production";

    const commerceCode = isIntegration
      ? IntegrationCommerceCodes.WEBPAY_PLUS
      : String(cfg.commerce_code || "").trim();
    const apiKey = isIntegration ? IntegrationApiKeys.WEBPAY : String(cfg.api_key || "").trim();
    const env = isIntegration ? Environment.Integration : Environment.Production;

    if (isProduction) {
      if (!commerceCode) throw Object.assign(new Error("Falta el código de comercio Webpay (Admin → Pagos)."), { status: 400 });
      if (!apiKey) throw Object.assign(new Error("Falta la API Key de Webpay (Admin → Pagos)."), { status: 400 });
    }
    if (mode === "mock") {
      throw Object.assign(new Error("Webpay está en modo simulación. Cambia a Integración o Producción en Admin → Pagos."), {
        status: 400,
      });
    }

    return new WebpayPlus.Transaction(new Options(commerceCode, apiKey, env));
  }

  async function resolvePublicBaseUrl(req, db) {
    const cfg = db ? await readPaymentSettings(db) : null;
    const forced = String(cfg?.public_base_url || process.env.PUBLIC_BASE_URL || "").trim();
    if (forced) return forced.replace(/\/+$/, "");
    const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() || "http";
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
    if (!host) return "http://localhost:3000";
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  async function isWebpayMock(db) {
    const cfg = await readPaymentSettings(db);
    return cfg.mode === "mock";
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
      await ensureStoreTags(db, ["Mitos y Leyendas", "Pokémon"]);
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
        {
          projection: {
            email: 1,
            name: 1,
            role: 1,
            username: 1,
            first_name: 1,
            last_name: 1,
            birth_day: 1,
            birth_month: 1,
            birth_year: 1,
            rut: 1,
            popid: 1,
            myl_cl: 1,
            email_verified: 1,
            deleted_at: 1,
          },
        }
      );
      if (!u || u.deleted_at) return res.json({ user: null });
      res.json({ user: publicUserPayload(u) });
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

      if (req.body?.rut != null) {
        const parsed = assertValidRut(req.body.rut);
        await assertRutAvailable(db, parsed.clean, u.id);
        patch.rut = parsed.formatted;
        patch.rut_normalized = parsed.clean;
      }

      if (req.body?.popid != null) {
        const popid = normalizePopid(req.body.popid);
        patch.popid = popid || null;
      }
      if (req.body?.myl_cl != null || req.body?.cl != null) {
        const myl_cl = normalizeMylCl(req.body.myl_cl ?? req.body.cl);
        patch.myl_cl = myl_cl || null;
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
        {
          projection: {
            email: 1,
            name: 1,
            role: 1,
            username: 1,
            first_name: 1,
            last_name: 1,
            birth_day: 1,
            birth_month: 1,
            birth_year: 1,
            rut: 1,
            popid: 1,
            myl_cl: 1,
            email_verified: 1,
          },
        }
      );
      res.json({ ok: true, user: publicUserPayload(updated) });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/me/export", async (req, res) => {
    try {
      const u = await requireUser(req);
      const db = await getDb();
      const profile = await db.collection("store_users").findOne(
        { _id: u.id },
        {
          projection: {
            pass_hash: 0,
          },
        }
      );
      const orders = await db
        .collection("store_orders")
        .find({ user_id: u.id })
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray();
      const registrations = await db
        .collection("event_registrations")
        .find({ user_id: u.id })
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray();
      const safeProfile = { ...(profile || {}) };
      delete safeProfile.pass_hash;
      res.json({
        ok: true,
        export: {
          exported_at: new Date().toISOString(),
          profile: safeProfile,
          orders,
          event_registrations: registrations,
        },
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/me/delete", async (req, res) => {
    try {
      const u = await requireUser(req);
      if (u.role === "admin") {
        return res.status(403).json({ ok: false, error: "Las cuentas admin no se eliminan desde aquí." });
      }
      const confirm = String(req.body?.confirm || "").trim().toUpperCase();
      if (confirm !== "ELIMINAR") {
        return res.status(400).json({ ok: false, error: 'Confirma escribiendo ELIMINAR.' });
      }
      const db = await getDb();
      const now = new Date();
      const anonEmail = `deleted+${u.id}@invalid.local`;
      await db.collection("store_users").updateOne(
        { _id: u.id },
        {
          $set: {
            email: anonEmail,
            username: `deleted_${u.id}`,
            name: "Cuenta eliminada",
            first_name: null,
            last_name: null,
            rut: null,
            rut_normalized: null,
            birth_day: null,
            birth_month: null,
            birth_year: null,
            birth_date: null,
            popid: null,
            myl_cl: null,
            pass_hash: await bcrypt.hash(`deleted_${u.id}_${Date.now()}`, 10),
            email_verified: false,
            deleted_at: now,
            updatedAt: now,
          },
        }
      );
      await db.collection("cart_items").deleteMany({ user_id: u.id });
      await db.collection("store_orders").updateMany(
        { user_id: u.id },
        {
          $set: {
            buyer_email: anonEmail,
            buyer_name: "Cuenta eliminada",
            "fulfillment.email": anonEmail,
            "fulfillment.recipient": "Cuenta eliminada",
            "fulfillment.phone": null,
            "fulfillment.rut": null,
            privacy_anonymized_at: now,
            updatedAt: now,
          },
        }
      );
      await db.collection("event_registrations").updateMany(
        { user_id: u.id },
        {
          $set: {
            buyer_email: anonEmail,
            buyer_name: "Cuenta eliminada",
            phone: null,
            privacy_anonymized_at: now,
            updatedAt: now,
          },
        }
      );
      res.setHeader("Set-Cookie", clearSessionCookie());
      res.json({ ok: true, message: "Cuenta eliminada / anonimizada." });
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
      const rl = rateLimit(clientKey(req, "register"), { limit: 8, windowMs: 15 * 60 * 1000 });
      if (!rl.ok) return res.status(429).json({ ok: false, error: `Demasiados registros. Espera ${rl.retryAfterSec}s.` });
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
      const termsAccepted =
        req.body?.terms_accepted === true || req.body?.terms_accepted === 1 || req.body?.terms_accepted === "1";
      const name = `${first_name} ${last_name}`.trim() || email.split("@")[0] || "usuario";
      if (!email || !email.includes("@")) return res.status(400).json({ ok: false, error: "Email inválido." });
      {
        const weak = passwordValidationError(password);
        if (weak) return res.status(400).json({ ok: false, error: weak });
      }
      if (password_confirm && password !== password_confirm) {
        return res.status(400).json({ ok: false, error: "Las contraseñas no coinciden." });
      }
      if (!termsAccepted) {
        return res.status(400).json({ ok: false, error: "Debes aceptar los términos y la política de privacidad." });
      }
      const rutParsed = assertValidRut(req.body?.rut);
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
      const ops = await readStoreOps(db);
      const ageCheck = ageFromBirth(birth_year, birth_month, birth_day, ops.min_age);
      if (!ageCheck.ok) {
        return res.status(400).json({
          ok: false,
          error: `Debes tener al menos ${ops.min_age} años para crear una cuenta.`,
        });
      }
      const exists = await db.collection("store_users").findOne(
        { email, $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }] },
        { projection: { _id: 1 } }
      );
      if (exists) return res.status(409).json({ ok: false, error: "Ese email ya está registrado." });
      const existsUser = await db.collection("store_users").findOne(
        { username, $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }] },
        { projection: { _id: 1 } }
      );
      if (existsUser) return res.status(409).json({ ok: false, error: "Ese nombre de usuario ya está en uso." });
      await assertRutAvailable(db, rutParsed.clean);
      const id = await nextSeq(db, "user");
      const passHash = await bcrypt.hash(password, 10);
      const now = new Date();
      await db.collection("store_users").insertOne({
        _id: id,
        username,
        first_name,
        last_name,
        rut: rutParsed.formatted,
        rut_normalized: rutParsed.clean,
        birth_day,
        birth_month,
        birth_year,
        birth_date: dob,
        email,
        name,
        role: "customer",
        pass_hash: passHash,
        email_verified: false,
        terms_accepted_at: now,
        createdAt: now,
      });

      // Enviar verificación (SMTP obligatorio según config ops)
      try {
        const { token } = await createAuthToken(db, {
          type: "verify_email",
          user_id: id,
          email,
          ttlMs: 24 * 60 * 60 * 1000,
        });
        const base = await resolvePublicBaseUrl(req, db);
        const link = `${base}/verificar-email?token=${encodeURIComponent(token)}`;
        const mailRes = await sendMail(db, {
          to: email,
          subject: "Verifica tu correo · Plasma Store",
          text: `Verifica tu cuenta: ${link}`,
          html: `<p>Hola ${name},</p><p><a href="${link}">Verifica tu correo</a> para activar tu cuenta.</p>`,
        });
        if (!mailRes?.ok) {
          console.warn("[register] verify mail not sent:", mailRes?.error || "unknown");
          if (ops.smtp_required_on_register) {
            await db.collection("store_users").deleteOne({ _id: id });
            return res.status(502).json({
              ok: false,
              error:
                "No se pudo enviar el correo de verificación. Revisa la config SMTP (Admin → Correo) e inténtalo de nuevo.",
            });
          }
        }
      } catch (mailErr) {
        console.warn("[register] verify mail skipped", mailErr instanceof Error ? mailErr.message : mailErr);
        if (ops.smtp_required_on_register) {
          await db.collection("store_users").deleteOne({ _id: id });
          return res.status(502).json({
            ok: false,
            error: "Correo de verificación no disponible. Intenta más tarde o contacta a la tienda.",
          });
        }
      }

      const cookie = makeSessionCookie({ uid: String(id), admin: false }, 60 * 60 * 24 * 14);
      res.setHeader("Set-Cookie", cookie);
      res.json({
        ok: true,
        user: {
          id,
          email,
          name,
          role: "customer",
          rut: rutParsed.formatted,
          email_verified: false,
        },
        message: "Cuenta creada. Revisa tu correo para verificarla (también puedes comprar como invitado con tu email).",
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/login", async (req, res) => {
    try {
      const rl = rateLimit(clientKey(req, "login"), { limit: 20, windowMs: 15 * 60 * 1000 });
      if (!rl.ok) return res.status(429).json({ ok: false, error: `Demasiados intentos. Espera ${rl.retryAfterSec}s.` });
      const db = await getDb();
      const loginId = String(req.body?.email || req.body?.emailOrUser || "").trim();
      const email = loginId.toLowerCase();
      const password = String(req.body?.password || "").trim();
      if (!loginId || !password) return res.status(400).json({ ok: false, error: "Faltan credenciales." });
      const isEmail = loginId.includes("@");
      const row = await db.collection("store_users").findOne(isEmail ? { email } : { username: loginId.toLowerCase() });
      if (!row?.pass_hash || row.deleted_at) return res.status(401).json({ ok: false, error: "Usuario o contraseña incorrectos." });
      const ok = await bcrypt.compare(password, String(row.pass_hash));
      if (!ok) return res.status(401).json({ ok: false, error: "Usuario o contraseña incorrectos." });

      if (row.role === "admin" && row.totp_enabled && row.totp_secret) {
        const { token } = await createAuthToken(db, {
          type: "pending_2fa",
          user_id: row._id,
          email: row.email,
          ttlMs: 5 * 60 * 1000,
        });
        return res.json({
          ok: true,
          requires_2fa: true,
          pending_token: token,
          message: "Ingresa el código de tu autenticador.",
        });
      }

      const cookie = makeSessionCookie({ uid: String(row._id), admin: row.role === "admin" }, 60 * 60 * 24 * 14);
      res.setHeader("Set-Cookie", cookie);
      res.json({
        ok: true,
        user: {
          id: row._id,
          email: row.email,
          name: row.name,
          role: row.role,
          rut: row.rut ?? null,
          email_verified: row.email_verified === true || row.role === "admin",
        },
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/login/2fa", async (req, res) => {
    try {
      const db = await getDb();
      const pending = String(req.body?.pending_token || "").trim();
      const code = String(req.body?.code || "").trim();
      const consumed = await consumeAuthToken(db, pending, "pending_2fa");
      if (!consumed?.ok) return res.status(401).json({ ok: false, error: consumed?.error || "Sesión 2FA inválida o expirada." });
      const row = await db.collection("store_users").findOne({ _id: consumed.user_id });
      if (!row || row.deleted_at || row.role !== "admin" || !row.totp_enabled || !row.totp_secret) {
        return res.status(401).json({ ok: false, error: "No se pudo completar el 2FA." });
      }
      if (!verifyTotp(String(row.totp_secret), code)) {
        return res.status(401).json({ ok: false, error: "Código 2FA incorrecto." });
      }
      const cookie = makeSessionCookie({ uid: String(row._id), admin: true }, 60 * 60 * 24 * 14);
      res.setHeader("Set-Cookie", cookie);
      res.json({
        ok: true,
        user: {
          id: row._id,
          email: row.email,
          name: row.name,
          role: row.role,
          rut: row.rut ?? null,
          email_verified: true,
        },
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/products", async (req, res) => {
    try {
      const db = await getDb();
      await expireReservations(db);
      const tag = req.query?.tag != null ? String(req.query.tag).trim().toLowerCase() : "";
      const limitRaw = req.query?.limit != null ? parseInt(String(req.query.limit), 10) : NaN;
      const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 120;

      const filter = { active: { $ne: 0 } };
      if (tag) {
        // productos guardan tags como array de slugs
        filter.tags = tag;
      }
      // Pedimos un poco de más por si hay store_only que se filtran
      const fetchCap = Math.min(500, Math.max(limit * 3, limit + 40));
      const products = await db
        .collection("products")
        .find(filter)
        .project({
          name: 1,
          description: 1,
          price_cents: 1,
          compare_price_cents: 1,
          discount_percent: 1,
          promo_min_qty: 1,
          promo_bundle_total_cents: 1,
          stock: 1,
          image_url: 1,
          image_urls: 1,
          tags: 1,
          sales_channel: 1,
          product_kind: 1,
          event_id: 1,
        })
        .sort({ _id: 1 })
        .limit(fetchCap)
        .toArray();

      const webCandidates = products.filter((p) => isWebSellable(p) && !isEventProduct(p));
      const reservedMap = await reservedQtyMap(
        db,
        webCandidates.map((p) => p._id)
      );

      const webProducts = [];
      for (const p of webCandidates) {
        const available = availableForWebFromMap(p, reservedMap);
        const pricing = effectiveLinePricing(p, 1);
        webProducts.push({
          id: p._id,
          name: p.name,
          description: p.description || "",
          price_cents: pricing.unit_price_cents,
          list_price_cents: pricing.list_price_cents,
          compare_price_cents: typeof p.compare_price_cents === "number" ? p.compare_price_cents : null,
          discount_percent: pricing.discount_percent,
          promo_min_qty: Math.max(0, parseInt(String(p.promo_min_qty ?? 0), 10) || 0),
          promo_bundle_total_cents: Math.max(0, parseInt(String(p.promo_bundle_total_cents ?? 0), 10) || 0),
          stock: available,
          image_url: p.image_url ?? null,
          image_urls: Array.isArray(p.image_urls) ? p.image_urls : p.image_url ? [p.image_url] : [],
          tags: Array.isArray(p.tags) ? p.tags : [],
          sales_channel: normalizeSalesChannel(p.sales_channel),
      });
        if (webProducts.length >= limit) break;
      }
      res.setHeader("Cache-Control", "public, max-age=15, stale-while-revalidate=60");
      res.json({ ok: true, products: webProducts });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/products/:id", async (req, res) => {
    try {
      const db = await getDb();
      await expireReservations(db);
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
            discount_percent: 1,
            promo_min_qty: 1,
            promo_bundle_total_cents: 1,
            stock: 1,
            image_url: 1,
            image_urls: 1,
            tags: 1,
            sales_channel: 1,
          },
        }
      );
      if (!row || !isWebSellable(row)) return res.status(404).json({ ok: false, error: "Producto no encontrado." });
      const image_urls = Array.isArray(row.image_urls) ? row.image_urls : row.image_url ? [row.image_url] : [];
      const available = await availableForWeb(db, row);
      const pricing = effectiveLinePricing(row, 1);
      res.json({
        ok: true,
        product: {
          id: row._id,
          name: row.name,
          description: row.description || "",
          price_cents: pricing.unit_price_cents,
          list_price_cents: pricing.list_price_cents,
          compare_price_cents: typeof row.compare_price_cents === "number" ? row.compare_price_cents : null,
          discount_percent: pricing.discount_percent,
          promo_min_qty: Math.max(0, parseInt(String(row.promo_min_qty ?? 0), 10) || 0),
          promo_bundle_total_cents: Math.max(0, parseInt(String(row.promo_bundle_total_cents ?? 0), 10) || 0),
          stock: available,
          image_url: row.image_url ?? null,
          image_urls,
          tags: Array.isArray(row.tags) ? row.tags : [],
          sales_channel: normalizeSalesChannel(row.sales_channel),
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
          { $match: { "p.active": { $ne: 0 }, "p.sales_channel": { $ne: "store_only" } } },
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

      // Filtrar canal (docs sin sales_channel = both) y exponer stock disponible web
      await expireReservations(db);
      const out = [];
      for (const row of rows) {
        const prod = await db.collection("products").findOne({ _id: row.id }, { projection: { stock: 1, sales_channel: 1, active: 1 } });
        if (!prod || !isWebSellable(prod) || prod.active === 0 || isEventProduct(prod)) continue;
        out.push({ ...row, stock: await availableForWeb(db, { _id: row.id, stock: prod.stock }) });
      }

      res.json({ ok: true, products: out });
    } catch (e) {
      handleErr(res, e);
    }
  });

  // =========================
  // Checkout + Webpay
  // =========================
  app.get("/api/store/checkout/options", async (_req, res) => {
    try {
      const db = await getDb();
      const ship = await readShippingSettings(db);
      const fee = ship.charge_shipping_online ? ship.shipping_fee_cents : 0;
      const pay = await readPaymentSettings(db);
      res.json({
        ok: true,
        shipping_fee_cents: fee,
        shipping_note: ship.shipping_note,
        pickup_address: ship.pickup_address,
        charge_shipping_online: Boolean(ship.charge_shipping_online),
        tuu_enabled: pay.tuu_enabled !== false,
        methods: [
          { id: "pickup", label: "Retiro en tienda", fee_cents: 0 },
          {
            id: "shipping",
            label: "Envío a domicilio",
            fee_cents: fee,
            note: ship.shipping_note,
          },
        ],
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/admin/shipping", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const shipping = await readShippingSettings(db);
      res.json({ ok: true, shipping });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.patch("/api/store/admin/shipping", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const shipping = await saveShippingSettings(db, req.body || {});
      res.json({ ok: true, shipping, message: "Envío / retiro guardado." });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/site-content", async (_req, res) => {
    try {
      const db = await getDb();
      const content = await publicSiteContent(db);
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
      res.json({ ok: true, content });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/admin/site-content", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const content = await readSiteContent(db);
      res.json({ ok: true, content });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.patch("/api/store/admin/site-content", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const content = await saveSiteContent(db, req.body || {});
      res.json({ ok: true, content, message: "Contenido del sitio guardado." });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/admin/site-content/image", (req, res) => {
    uploadLandingImage.single("image")(req, res, async (err) => {
      try {
        if (err) return res.status(400).json({ ok: false, error: err.message || "Archivo inválido." });
        await requireAdmin(req);
        const slot = String(req.body?.slot || req.query?.slot || "").trim().toLowerCase();
        if (slot !== "sealed" && slot !== "events") {
          return res.status(400).json({ ok: false, error: "Indica si la imagen es de Sellado o Eventos." });
        }
        if (!req.file) return res.status(400).json({ ok: false, error: "Falta el archivo de imagen." });
        let imageUrl = null;
        if (req.file.buffer && Buffer.isBuffer(req.file.buffer)) {
          const mime = req.file.mimetype || "image/jpeg";
          imageUrl = `data:${mime};base64,${req.file.buffer.toString("base64")}`;
        } else if (req.file.filename) {
          imageUrl = `/store-media/landing/${req.file.filename}`;
        }
        if (!imageUrl) return res.status(400).json({ ok: false, error: "No se pudo guardar la imagen." });
        const db = await getDb();
        const patch =
          slot === "sealed"
            ? { home_cards: { sealed_image_url: imageUrl } }
            : { home_cards: { events_image_url: imageUrl } };
        const content = await saveSiteContent(db, patch);
        res.json({
          ok: true,
          content,
          image_url: imageUrl,
          message: slot === "sealed" ? "Imagen de Sellado actualizada." : "Imagen de Eventos actualizada.",
        });
      } catch (e) {
        handleErr(res, e);
      }
    });
  });

  app.post("/api/store/admin/events/image", (req, res) => {
    uploadLandingImage.single("image")(req, res, async (err) => {
      try {
        if (err) return res.status(400).json({ ok: false, error: err.message || "Archivo inválido." });
        await requireAdmin(req);
        if (!req.file) return res.status(400).json({ ok: false, error: "Falta el archivo de imagen (JPG o PNG)." });
        const mime = String(req.file.mimetype || "").toLowerCase();
        if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/jpg") {
          return res.status(400).json({ ok: false, error: "Solo se aceptan JPG o PNG." });
        }
        let imageUrl = null;
        if (req.file.buffer && Buffer.isBuffer(req.file.buffer)) {
          imageUrl = `data:${mime === "image/jpg" ? "image/jpeg" : mime};base64,${req.file.buffer.toString("base64")}`;
        } else if (req.file.filename) {
          imageUrl = `/store-media/landing/${req.file.filename}`;
        }
        if (!imageUrl) return res.status(400).json({ ok: false, error: "No se pudo guardar la imagen." });
        res.json({ ok: true, image_url: imageUrl, message: "Imagen subida." });
      } catch (e) {
        handleErr(res, e);
      }
    });
  });

  // =========================
  // Eventos / cupos
  // =========================
  app.post("/api/store/events/:id/register", async (req, res) => {
    try {
      const actor = await resolveCartActor(req, res);
      const db = await getDb();
      const eventId = parseInt(String(req.params.id), 10);
      const event = await findEventById(db, eventId);
      if (!event || !event.active) return res.status(404).json({ ok: false, error: "Evento no encontrado." });
      if (!event.registration_enabled) {
        return res.status(400).json({ ok: false, error: "Este evento no tiene inscripción online." });
      }
      await expireUnpaidEventRegistrations(db, [event]);
      if (eventHasStarted(event)) {
        return res.status(400).json({
          ok: false,
          error: "El evento ya comenzó. Los cupos no pagados se liberaron y no se pueden reservar más.",
        });
      }

      const avail = await eventAvailability(db, event);
      if (avail.sold_out) return res.status(409).json({ ok: false, error: "No quedan cupos para este evento." });

      const buyerEmail = String(req.body?.email || actor.user?.email || "")
        .trim()
        .toLowerCase();
      const buyerName = String(req.body?.name || actor.user?.name || "").trim().slice(0, 120);
      const phone = String(req.body?.phone || "").trim().slice(0, 40);
      const paymentMethod = String(req.body?.payment_method || "").trim().toLowerCase();
      const termsAccepted = req.body?.terms_accepted === true || req.body?.terms_accepted === 1 || req.body?.terms_accepted === "1";

      if (!buyerEmail.includes("@")) return res.status(400).json({ ok: false, error: "Indica un email válido." });
      if (!buyerName || buyerName.length < 2) return res.status(400).json({ ok: false, error: "Indica tu nombre." });
      if (!termsAccepted) {
        return res.status(400).json({ ok: false, error: "Debes aceptar los términos y condiciones del cupo." });
      }

      const payOnline =
        (avail.payment_online || avail.payment_webpay) &&
        (paymentMethod === "tuu" ||
          paymentMethod === "online" ||
          paymentMethod === "webpay" ||
          paymentMethod === "pagar");
      const payStore = avail.payment_store && (paymentMethod === "store" || paymentMethod === "tienda");
      if (!payOnline && !payStore) {
        return res.status(400).json({
          ok: false,
          error: "Elige si pagas en la tienda o en línea.",
        });
      }

      const now = new Date();
      const cancelHours = avail.cancel_hours;
      const cancel_until =
        cancelHours > 0 ? new Date(now.getTime() + cancelHours * 60 * 60 * 1000) : null;
      const regId = await nextSeq(db, "event_registration");
      const price_cents = avail.price_cents;
      const terms_text = buildEventTermsText(event);

      if (payStore || price_cents <= 0) {
        const status = payStore && price_cents > 0 ? "pending_store_payment" : "paid";
        const doc = {
          _id: regId,
          event_id: event.id,
          event_title: event.title,
          user_id: actor.kind === "user" ? actor.userId : null,
          guest_id: actor.kind === "guest" ? actor.guestId : null,
          buyer_email: buyerEmail,
          buyer_name: buyerName,
          phone: phone || null,
          payment_method: payStore ? "store" : "free",
          status,
          price_cents,
          cancel_until,
          cancel_hours: cancelHours,
          terms_accepted_at: now,
          terms_text,
          order_id: null,
          createdAt: now,
          updatedAt: now,
        };
        await db.collection("event_registrations").insertOne(doc);
        return res.json({
          ok: true,
          registration: doc,
          message:
            status === "paid"
              ? "Cupo confirmado."
              : "Cupo reservado. Completa el pago en tienda para confirmarlo.",
        });
      }

      if (!phone) {
        return res.status(400).json({ ok: false, error: "Indica un teléfono para el pago en línea." });
      }

      const payCfg = await readPaymentSettings(db);
      const tuu = resolveTuuCredentials(payCfg);
      if (!tuu.enabled) {
        return res.status(400).json({ ok: false, error: "El pago en línea no está habilitado (TUU)." });
      }
      if (tuu.mode === "production" && (!tuu.accountId || !tuu.secret)) {
        return res.status(400).json({
          ok: false,
          error: "Faltan RUT/account_id y clave secreta de TUU (Admin → Sistema de pago).",
        });
      }

      const orderId = await nextSeq(db, "order");
      const base = await resolvePublicBaseUrl(req, db);
      const names = splitCustomerName(buyerName || buyerEmail.split("@")[0]);
      const reference = `PS${orderId}`;
      const fields = buildTuuPayload({
        accountId: tuu.accountId,
        amount: price_cents,
        email: buyerEmail,
        firstName: names.first,
        lastName: names.last,
        phone: normalizePhoneCl(phone),
        description: `Plasma Store — Cupo ${event.title} #${orderId}`,
        reference,
        shopName: "Plasma Store",
        callbackUrl: `${base}/api/store/checkout/tuu/callback`,
        cancelUrl: `${base}/api/store/checkout/tuu/cancel`,
        completeUrl: `${base}/api/store/checkout/tuu/complete`,
      });
      fields.x_signature = signTuuParams(fields, tuu.secret);

      const regDoc = {
        _id: regId,
        event_id: event.id,
        event_title: event.title,
        user_id: actor.kind === "user" ? actor.userId : null,
        guest_id: actor.kind === "guest" ? actor.guestId : null,
        buyer_email: buyerEmail,
        buyer_name: buyerName,
        phone: phone || null,
        payment_method: "tuu",
        status: "pending_payment",
        price_cents,
        cancel_until,
        cancel_hours: cancelHours,
        terms_accepted_at: now,
        terms_text,
        order_id: orderId,
        createdAt: now,
        updatedAt: now,
      };
      await db.collection("event_registrations").insertOne(regDoc);

      const nowTuu = new Date();
      await db.collection("store_orders").insertOne({
        _id: orderId,
        user_id: actor.kind === "user" ? actor.userId : null,
        guest_id: actor.kind === "guest" ? actor.guestId : null,
        buyer_email: buyerEmail,
        buyer_name: buyerName,
        status: "pending_payment",
        currency: "CLP",
        subtotal_cents: price_cents,
        shipping_fee_cents: 0,
        total_cents: price_cents,
        items: [
          {
            product_id: 0,
            name: `Cupo: ${event.title}`,
            price_cents,
            quantity: 1,
            event_id: event.id,
          },
        ],
        fulfillment: {
          method: "event",
          label: `Cupo evento · ${event.title}`,
          email: buyerEmail,
          recipient: buyerName,
          phone: phone || null,
        },
        channel: "event",
        event_id: event.id,
        event_registration_id: regId,
        inventory_applied: false,
        payment: {
          provider: "tuu",
          buyOrder: reference,
          reference,
          url: tuu.endpoint,
          mode: tuu.mode,
          using_test: tuu.usingTest,
        },
        createdAt: nowTuu,
        updatedAt: nowTuu,
      });

      return res.json({
        ok: true,
        registration: regDoc,
        provider: "tuu",
        orderId,
        action: tuu.endpoint,
        fields,
        message: "Redirigiendo al pago en línea.",
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/admin/event-registrations", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const content = await readSiteContent(db);
      await expireStartedEventSales(db, content.events?.items || []);
      const eventId = parseInt(String(req.query?.event_id || ""), 10);
      const filter = {};
      if (Number.isFinite(eventId) && eventId > 0) filter.event_id = eventId;
      const rows = await db
        .collection("event_registrations")
        .find(filter)
        .sort({ _id: -1 })
        .limit(200)
        .toArray();
      res.json({ ok: true, registrations: rows });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/admin/event-registrations/:id/mark-paid", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ ok: false, error: "id inválido." });
      const now = new Date();
      const r = await db.collection("event_registrations").findOneAndUpdate(
        { _id: id, status: { $in: ["pending_store_payment", "pending_payment"] } },
        { $set: { status: "paid", paid_at: now, updatedAt: now } },
        { returnDocument: "after" }
      );
      const row = r?.value || r;
      if (!row) return res.status(404).json({ ok: false, error: "Inscripción no encontrada o ya pagada." });
      if (row.order_id) {
        await db.collection("store_orders").updateOne(
          { _id: row.order_id, status: { $in: ["pending_store_payment", "pending_payment"] } },
          { $set: { status: "paid", paid_at: now, updatedAt: now } }
        );
      }
      res.json({ ok: true, registration: row, message: "Marcada como pagada." });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/admin/event-registrations/:id/cancel", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ ok: false, error: "id inválido." });
      const prev = await db.collection("event_registrations").findOne({ _id: id });
      if (!prev || prev.status === "cancelled" || prev.status === "refunded") {
        return res.status(404).json({ ok: false, error: "Inscripción no encontrada." });
      }
      await releaseEventRegistration(db, prev, String(req.body?.reason || "admin").slice(0, 120));
      const row = await db.collection("event_registrations").findOne({ _id: id });
      res.json({ ok: true, registration: row, message: "Cupo liberado." });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post(["/api/store/checkout/webpay/create", "/api/store/checkout/tuu/create"], async (req, res) => {
    try {
      const actor = await resolveCartActor(req, res);
      const db = await getDb();
      await expireReservations(db);

      const buyerEmail = String(req.body?.fulfillment?.email || req.body?.email || actor.user?.email || "")
        .trim()
        .toLowerCase();
      if (!buyerEmail.includes("@")) {
        return res.status(400).json({ ok: false, error: "Indica un email para enviarte el comprobante de pago." });
      }

      const termsAccepted =
        req.body?.terms_accepted === true || req.body?.terms_accepted === 1 || req.body?.terms_accepted === "1";
      if (!termsAccepted) {
        return res.status(400).json({ ok: false, error: "Debes aceptar los términos y la política de privacidad." });
      }

      const opsCheckout = await readStoreOps(db);
      if (opsCheckout.require_email_verified && actor.kind === "user") {
        const urow = await db.collection("store_users").findOne(
          { _id: actor.userId },
          { projection: { email_verified: 1, role: 1 } }
        );
        if (urow?.role !== "admin" && urow?.email_verified !== true) {
          return res.status(403).json({
            ok: false,
            error: "Verifica tu correo antes de comprar. Revisa tu bandeja o reenvía la verificación desde Mi cuenta.",
          });
        }
      }

      let rutParsed;
      try {
        rutParsed = assertValidRut(req.body?.fulfillment?.rut || req.body?.rut || actor.user?.rut);
      } catch (e) {
        return res.status(400).json({ ok: false, error: e instanceof Error ? e.message : "RUT inválido." });
      }

      // Si el usuario logueado aún no tiene RUT, lo asociamos (si no choca con otra cuenta).
      if (actor.kind === "user") {
        const existing = await db.collection("store_users").findOne(
          { _id: actor.userId },
          { projection: { rut_normalized: 1 } }
        );
        if (!existing?.rut_normalized) {
          await assertRutAvailable(db, rutParsed.clean, actor.userId);
          await db.collection("store_users").updateOne(
            { _id: actor.userId },
            {
              $set: {
                rut: rutParsed.formatted,
                rut_normalized: rutParsed.clean,
                updatedAt: new Date(),
              },
            }
          );
        } else if (existing.rut_normalized !== rutParsed.clean) {
          return res.status(400).json({
            ok: false,
            error: "El RUT debe coincidir con el de tu cuenta. Puedes actualizarlo en Mi cuenta.",
          });
        }
      } else {
        // Invitado: no permitir RUT ya ligado a una cuenta activa (evita “doble identidad”).
        const taken = await db.collection("store_users").findOne(
          {
            rut_normalized: rutParsed.clean,
            $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }],
          },
          { projection: { _id: 1 } }
        );
        if (taken) {
          return res.status(409).json({
            ok: false,
            error: "Ese RUT ya tiene cuenta. Inicia sesión para comprar.",
          });
        }
      }

      const cart = await db
        .collection("cart_items")
        .aggregate([
          { $match: cartMatch(actor) },
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
              compare_price_cents: "$p.compare_price_cents",
              discount_percent: "$p.discount_percent",
              promo_min_qty: "$p.promo_min_qty",
              promo_bundle_total_cents: "$p.promo_bundle_total_cents",
              cost_cents: "$p.cost_cents",
              stock: "$p.stock",
              sales_channel: "$p.sales_channel",
              product_kind: "$p.product_kind",
              event_id: "$p.event_id",
              event_player: 1,
            },
          },
        ])
        .toArray();

      if (!cart.length) return res.status(400).json({ ok: false, error: "Carrito vacío." });

      // Liberar reservas previas del mismo actor
      const prevFilter =
        actor.kind === "user"
          ? { user_id: actor.userId, status: "pending_payment" }
          : { guest_id: actor.guestId, status: "pending_payment" };
      const prevPending = await db.collection("store_orders").find(prevFilter).project({ _id: 1 }).toArray();
      for (const o of prevPending) {
        await releaseReservationsForOrder(db, o._id, "superseded");
        await db.collection("store_orders").updateOne(
          { _id: o._id },
          { $set: { status: "cancelled", cancel_reason: "superseded_checkout", updatedAt: new Date() } }
        );
      }

      for (const it of cart) {
        const qty = parseInt(String(it.quantity ?? 0), 10);
        if (!Number.isFinite(qty) || qty < 1) return res.status(400).json({ ok: false, error: "Cantidad inválida en carrito." });
        if (!isWebSellable(it)) {
          return res.status(409).json({
            ok: false,
            error: `"${it.name}" solo se vende en tienda física. Quítalo del carrito para continuar.`,
          });
        }
        if (isEventProduct(it)) {
          const ev = it.event_id ? await findEventById(db, it.event_id) : null;
          if (ev && eventHasStarted(ev)) {
            return res.status(409).json({
              ok: false,
              error: `El evento “${it.name}” ya comenzó. Quítalo del carrito: los cupos no pagados se liberaron.`,
            });
          }
          if (ev) {
            const email = String(req.body?.email || actor.user?.email || "").trim().toLowerCase();
            try {
              await assertUserCanTakeEventCup(db, ev, { userId: actor.userId, email });
            } catch (pe) {
              return res.status(pe.status || 409).json({ ok: false, error: pe.message });
            }
          }
        }
        const avail = await availableForWeb(db, { _id: it.product_id, stock: it.stock });
        if (avail < qty) {
          return res.status(409).json({
            ok: false,
            error:
              avail <= 0
                ? STOCK_GONE_MSG
                : `Stock insuficiente para ${it.name} (disponible web: ${avail}).`,
          });
        }
      }

      const methodRaw = String(req.body?.fulfillment?.method || req.body?.method || "").trim().toLowerCase();
      const method = methodRaw === "shipping" || methodRaw === "envio" || methodRaw === "envío" ? "shipping" : methodRaw === "pickup" || methodRaw === "retiro" ? "pickup" : "";
      if (!method) return res.status(400).json({ ok: false, error: "Elige retiro en tienda o envío a domicilio." });

      const phone = String(req.body?.fulfillment?.phone || req.body?.phone || "").trim().slice(0, 40);
      const notes = String(req.body?.fulfillment?.notes || req.body?.notes || "").trim().slice(0, 400);
      const recipient = String(
        req.body?.fulfillment?.recipient || req.body?.recipient || actor.user?.name || buyerEmail.split("@")[0] || ""
      )
        .trim()
        .slice(0, 120);

      /** @type {null | { street: string, commune: string, region: string, apartment?: string }} */
      let address = null;
      if (method === "shipping") {
        const street = String(req.body?.fulfillment?.address?.street || req.body?.street || "").trim().slice(0, 200);
        const commune = String(req.body?.fulfillment?.address?.commune || req.body?.commune || "").trim().slice(0, 80);
        const region = String(req.body?.fulfillment?.address?.region || req.body?.region || "").trim().slice(0, 80);
        const apartment = String(req.body?.fulfillment?.address?.apartment || req.body?.apartment || "").trim().slice(0, 80);
        if (!street || street.length < 5) return res.status(400).json({ ok: false, error: "Indica la dirección de envío (calle y número)." });
        if (!commune) return res.status(400).json({ ok: false, error: "Indica la comuna." });
        if (!region) return res.status(400).json({ ok: false, error: "Indica la región." });
        if (!phone || phone.length < 8) return res.status(400).json({ ok: false, error: "Indica un teléfono de contacto para el envío." });
        address = { street, commune, region, ...(apartment ? { apartment } : {}) };
      } else if (phone && phone.length < 8) {
        return res.status(400).json({ ok: false, error: "Teléfono inválido." });
      }

      const pricedItems = cart.map((it) => {
        const qty = parseInt(String(it.quantity ?? 0), 10) || 0;
        const pricing = effectiveLinePricing(it, qty);
        return {
          product_id: it.product_id,
          name: it.name,
          price_cents: pricing.unit_price_cents,
          list_price_cents: pricing.list_price_cents,
          line_total_cents: pricing.line_total_cents,
          quantity: qty,
          cost_cents: Math.max(0, parseInt(String(it.cost_cents ?? 0), 10) || 0),
          discount_percent: pricing.discount_percent,
          promo_applied: pricing.promo_applied,
          product_kind: isEventProduct(it) ? "event" : "product",
          event_id: parseInt(String(it.event_id ?? 0), 10) || null,
          event_player: it.event_player || null,
        };
      });
      const subtotal = pricedItems.reduce((s, it) => s + it.line_total_cents, 0);
      const shipCfg = await readShippingSettings(db);
      const shipping_fee_cents =
        method === "shipping" && shipCfg.charge_shipping_online ? shipCfg.shipping_fee_cents : 0;
      const total = subtotal + shipping_fee_cents;
      if (!Number.isFinite(total) || total < 0) return res.status(400).json({ ok: false, error: "Total inválido." });
      if (total > 0 && total < 50) return res.status(400).json({ ok: false, error: "Total inválido." });

      const pickupAddress = shipCfg.pickup_address;
      const shippingNote = shipCfg.shipping_note;

      const fulfillment = {
        method,
        label: method === "pickup" ? "Retiro en tienda" : "Envío a domicilio (Starken)",
        recipient: recipient || null,
        phone: phone || null,
        email: buyerEmail,
        rut: rutParsed.formatted,
        notes: notes || null,
        address,
        pickup_address: method === "pickup" ? pickupAddress : null,
        shipping_note: method === "shipping" ? shippingNote : null,
        shipping_fee_cents,
        shipping_payment:
          method === "shipping" ? (shipCfg.charge_shipping_online ? "online" : "por_pagar") : null,
      };

      const orderId = await nextSeq(db, "order");
      // buy_order debe ser único en Transbank (máx 26). En integración el comercio es compartido.
      const buyOrder = `PS${orderId}${Date.now().toString(36)}`.replace(/[^a-zA-Z0-9]/g, "").slice(0, 26);
      const sessionId =
        actor.kind === "user"
          ? `u${actor.userId}s${Date.now().toString(36)}`.slice(0, 61)
          : `g${String(actor.guestId).slice(-10)}${Date.now().toString(36)}`.slice(0, 61);

      const base = await resolvePublicBaseUrl(req, db);
      // Retorno por API (acepta GET/POST de Transbank) y luego redirige a la SPA.
      const returnUrl = `${base}/api/store/checkout/webpay/return`;
      const pathHint = String(req.path || req.originalUrl || "");
      const payRaw = String(req.body?.pay_provider || "").trim().toLowerCase();
      const payProvider =
        payRaw === "store" || payRaw === "tienda"
          ? "store"
          : payRaw === "tuu" || pathHint.includes("/tuu/")
            ? "tuu"
            : "webpay";

      if (payProvider === "store" && method !== "pickup") {
        return res.status(400).json({
          ok: false,
          error: "Para pagar en tienda elige retiro en tienda (el cupo no se envía).",
        });
      }

      if (payProvider === "tuu" && total > 0) {
        const phoneNorm = normalizePhoneCl(phone);
        if (!phoneNorm) {
          return res.status(400).json({
            ok: false,
            error: "TUU requiere un teléfono de contacto (ej. +56 9 1234 5678).",
          });
        }
      }

      const mock = payProvider === "tuu" || payProvider === "store" ? false : await isWebpayMock(db);

      if (payProvider === "store") {
        const nowStore = new Date();
        const touched = [];
        try {
          for (const it of pricedItems) {
            const pid = parseInt(String(it.product_id), 10);
            const qty = parseInt(String(it.quantity), 10);
            if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(qty) || qty < 1) continue;
            const r = await db.collection("products").updateOne(
              { _id: pid, stock: { $gte: qty } },
              { $inc: { stock: -qty }, $set: { updatedAt: nowStore } }
            );
            if (!r?.modifiedCount) {
              throw Object.assign(new Error(`Ya no hay cupo/stock para ${it.name}.`), { status: 409 });
            }
            touched.push({ product_id: pid, quantity: qty });
          }
        } catch (e) {
          for (const t of touched) {
            try {
              await db.collection("products").updateOne(
                { _id: t.product_id },
                { $inc: { stock: t.quantity }, $set: { updatedAt: nowStore } }
              );
            } catch {
              /* ignore */
            }
          }
          throw e;
        }

        const storeOrder = {
        _id: orderId,
          user_id: actor.kind === "user" ? actor.userId : null,
          guest_id: actor.kind === "guest" ? actor.guestId : null,
          buyer_email: buyerEmail,
          buyer_name: recipient || null,
          buyer_rut: rutParsed.formatted,
          buyer_rut_normalized: rutParsed.clean,
          terms_accepted_at: nowStore,
          status: "pending_store_payment",
          currency: "CLP",
          subtotal_cents: subtotal,
          shipping_fee_cents: 0,
          total_cents: total,
          items: pricedItems,
          fulfillment: { ...fulfillment, method: "pickup", label: "Pago en tienda" },
          payment: { provider: "store", buyOrder: `PS${orderId}` },
          inventory_applied: true,
          inventory_applied_at: nowStore,
          event_cups_recorded: true,
          createdAt: nowStore,
          updatedAt: nowStore,
        };
        await db.collection("store_orders").insertOne(storeOrder);
        await recordPaidEventCupsFromOrder(db, storeOrder, {
          status: "pending_store_payment",
          paymentMethod: "store",
        });
        await db.collection("cart_items").deleteMany(cartMatch(actor));
        return res.json({
          ok: true,
          store_reserved: true,
          orderId,
          fulfillment: storeOrder.fulfillment,
          subtotal_cents: subtotal,
          total_cents: total,
          message: "Cupo reservado. Paga en la tienda antes del inicio del evento.",
        });
      }

      const reservationMeta = await createReservationsForOrder(db, {
        orderId,
        userId: actor.kind === "user" ? actor.userId : 0,
        items: pricedItems.map((it) => ({ product_id: it.product_id, quantity: it.quantity })),
      });

      const orderBase = {
        _id: orderId,
        user_id: actor.kind === "user" ? actor.userId : null,
        guest_id: actor.kind === "guest" ? actor.guestId : null,
        buyer_email: buyerEmail,
        buyer_name: recipient || null,
        buyer_rut: rutParsed.formatted,
        buyer_rut_normalized: rutParsed.clean,
        terms_accepted_at: new Date(),
        status: "pending_payment",
        currency: "CLP",
        subtotal_cents: subtotal,
        shipping_fee_cents,
        total_cents: total,
        items: pricedItems,
        fulfillment,
        reservation: {
          expiresAt: reservationMeta.expiresAt,
          ttl_ms: reservationMeta.ttl_ms,
        },
      };

      if (total === 0) {
        const nowFree = new Date();
        await db.collection("store_orders").insertOne({
          ...orderBase,
          payment: { provider: "free", buyOrder: `PS${orderId}` },
          createdAt: nowFree,
          updatedAt: nowFree,
        });
        const createdFree = await db.collection("store_orders").findOne({ _id: orderId });
        await settleApprovedOrder(db, createdFree);
        return res.json({
          ok: true,
          paid: true,
          orderId,
          fulfillment,
          subtotal_cents: subtotal,
          shipping_fee_cents,
          total_cents: 0,
        });
      }

      if (mock) {
        const now = new Date();
        const mockToken = `mock_${buyOrder}`;
        await db.collection("store_orders").insertOne({
          ...orderBase,
          payment: {
            provider: "webpay_mock",
            buyOrder,
            token: mockToken,
            url: null,
          },
          createdAt: now,
          updatedAt: now,
        });
        return res.json({
          ok: true,
          mock: true,
          orderId,
          token: mockToken,
          url: `${base}/webpay/return?token_ws=${encodeURIComponent(mockToken)}`,
          fulfillment,
          subtotal_cents: subtotal,
          shipping_fee_cents,
          total_cents: total,
          reservation_expires_at: reservationMeta.expiresAt,
          reservation_ttl_ms: RESERVATION_TTL_MS,
        });
      }

      if (payProvider === "tuu") {
        const payCfg = await readPaymentSettings(db);
        const tuu = resolveTuuCredentials(payCfg);
        if (!tuu.enabled) {
          await releaseReservationsForOrder(db, orderId, "tuu_disabled");
          return res.status(400).json({ ok: false, error: "TUU Pago Online no está habilitado." });
        }
        if (tuu.error) {
          await releaseReservationsForOrder(db, orderId, "tuu_config_error");
          return res.status(400).json({ ok: false, error: tuu.error });
        }
        if (tuu.mode === "production" && !isHttpsUrl(base)) {
          await releaseReservationsForOrder(db, orderId, "tuu_https_required");
          return res.status(400).json({
            ok: false,
            error: "En producción TUU exige URL pública HTTPS (Admin → Sistema de pago → URL pública).",
          });
        }
        const names = splitCustomerName(recipient || buyerEmail.split("@")[0]);
        const reference = `PS${orderId}`;
        const fields = buildTuuPayload({
          accountId: tuu.accountId,
          amount: total,
          email: buyerEmail,
          firstName: names.first,
          lastName: names.last,
          phone: normalizePhoneCl(phone),
          description: `Plasma Store — Venta #${orderId}`,
          reference,
          shopName: "Plasma Store",
          callbackUrl: `${base}/api/store/checkout/tuu/callback`,
          cancelUrl: `${base}/api/store/checkout/tuu/cancel`,
          completeUrl: `${base}/api/store/checkout/tuu/complete`,
        });
        fields.x_signature = signTuuParams(fields, tuu.secret);

        // Preferir payment intent por API (URL directa). Si falla, POST form firmado.
        const intent = await requestTuuPaymentUrl(tuu.endpoint, fields);
        if (tuu.mode === "production" && intent.error && !intent.url) {
          await releaseReservationsForOrder(db, orderId, "tuu_intent_failed");
          return res.status(502).json({
            ok: false,
            error: intent.error,
            detail: intent.detail || undefined,
          });
        }

        const nowTuu = new Date();
        await db.collection("store_orders").insertOne({
          ...orderBase,
          payment: {
            provider: "tuu",
            buyOrder: reference,
            reference,
            url: intent.url || tuu.endpoint,
            mode: tuu.mode,
            using_test: tuu.usingTest,
            intent_status: intent.status || null,
          },
          createdAt: nowTuu,
          updatedAt: nowTuu,
        });
        return res.json({
          ok: true,
          provider: "tuu",
          orderId,
          url: intent.url || null,
          action: tuu.endpoint,
          fields,
          fulfillment,
          subtotal_cents: subtotal,
          shipping_fee_cents,
          total_cents: total,
          reservation_expires_at: reservationMeta.expiresAt,
          reservation_ttl_ms: RESERVATION_TTL_MS,
        });
      }

      const tx = await makeWebpayTx(db);
      let createResp;
      try {
        createResp = await tx.create(buyOrder, sessionId, total, returnUrl);
      } catch (e) {
        await releaseReservationsForOrder(db, orderId, "webpay_create_failed");
        const detail = e instanceof Error ? e.message : String(e);
        console.error("[webpay] create failed", { buyOrder, sessionId, total, returnUrl, detail });
        throw Object.assign(new Error(`Webpay no pudo crear la transacción: ${detail}`), { status: 502 });
      }

      const now = new Date();
      await db.collection("store_orders").insertOne({
        ...orderBase,
        payment: {
          provider: "webpay",
          buyOrder,
          token: createResp?.token || null,
          url: createResp?.url || null,
          return_url: returnUrl,
        },
        createdAt: now,
        updatedAt: now,
      });

      res.json({
        ok: true,
        orderId,
        token: createResp?.token,
        url: createResp?.url,
        fulfillment,
        subtotal_cents: subtotal,
        shipping_fee_cents,
        total_cents: total,
        reservation_expires_at: reservationMeta.expiresAt,
        reservation_ttl_ms: RESERVATION_TTL_MS,
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  /** Transbank vuelve acá (GET/POST). Redirigimos a la SPA con token_ws. */
  app.all("/api/store/checkout/webpay/return", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const q = req.query && typeof req.query === "object" ? req.query : {};
      const token =
        String(body.token_ws || body.TBK_TOKEN || q.token_ws || q.TBK_TOKEN || "").trim() ||
        "";
      const base = await resolvePublicBaseUrl(req);
      if (!token) {
        // Aborto / timeout: sin token
        return res.redirect(303, `${base}/webpay/return?aborted=1`);
      }
      return res.redirect(303, `${base}/webpay/return?token_ws=${encodeURIComponent(token)}`);
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/checkout/webpay/commit", async (req, res) => {
    try {
      const actor = await resolveCartActor(req, res);
      const db = await getDb();
      const token = String(req.body?.token_ws || req.body?.token || "").trim();
      if (!token) return res.status(400).json({ ok: false, error: "Falta token_ws." });

      const orderCandidates = await db.collection("store_orders").find({
        $or: [
          { "payment.provider": "webpay", "payment.token": token },
          { "payment.provider": "webpay_mock", "payment.token": token },
        ],
      }).toArray();
      let order = null;
      for (const o of orderCandidates) {
        if (actor.kind === "user" && Number(o.user_id) === Number(actor.userId)) {
          order = o;
          break;
        }
        if (actor.kind === "guest" && o.guest_id && o.guest_id === actor.guestId) {
          order = o;
          break;
        }
      }
      // Fallback: token único (mock / retorno)
      if (!order && orderCandidates.length === 1) order = orderCandidates[0];
      if (!order) return res.status(404).json({ ok: false, error: "Orden no encontrada para este token." });

      const now = new Date();
      let approved = false;
      let commitResp = null;
      let orderStatus = "payment_failed";

      if (order.payment?.provider === "webpay_mock" || token.startsWith("mock_")) {
        approved = true;
        orderStatus = "paid";
        commitResp = { status: "AUTHORIZED", mock: true };
      await db.collection("store_orders").updateOne(
        { _id: order._id },
        {
          $set: {
              status: orderStatus,
              "payment.commit": commitResp,
              updatedAt: now,
            },
          }
        );
      } else {
        const tx = await makeWebpayTx(db);
        commitResp = await tx.commit(token);
        approved = String(commitResp?.status || "").toUpperCase() === "AUTHORIZED";
        orderStatus = approved ? "paid" : "payment_failed";
        await db.collection("store_orders").updateOne(
          { _id: order._id },
          {
            $set: {
              status: orderStatus,
            "payment.commit": commitResp ?? null,
            updatedAt: now,
          },
        }
      );
      }

      let inventoryApplied = false;
      let inventoryWarning = null;

      // Si pagó, descontar stock (idempotente por orden) — exige reserva web aún válida
      // Órdenes de cupo de evento no tocan inventario de productos.
      if (approved) {
        if (order.channel === "event" || order.event_registration_id) {
          inventoryApplied = true;
          await db.collection("store_orders").updateOne(
            { _id: order._id },
            { $set: { inventory_applied: true, inventory_applied_at: now, updatedAt: now } }
          );
          if (order.event_registration_id) {
            await db.collection("event_registrations").updateOne(
              { _id: order.event_registration_id, status: { $in: ["pending_payment", "pending_store_payment"] } },
              { $set: { status: "paid", paid_at: now, updatedAt: now } }
            );
          }
          try {
            await issueBoletaForOrder(db, order);
          } catch {
            /* ignore */
          }
          const paidOrder = await db.collection("store_orders").findOne({ _id: order._id });
          try {
            await sendOrderReceipt(db, paidOrder);
          } catch {
            /* ignore */
          }
          try {
            await sendOrderAdminNotify(db, paidOrder);
          } catch {
            /* ignore */
          }
        } else {
        const fresh = await db.collection("store_orders").findOne(
          { _id: order._id },
          { projection: { items: 1, inventory_applied: 1, stock_conflict: 1, stock_conflict_msg: 1 } }
        );
        if (fresh?.inventory_applied) {
          inventoryApplied = true;
        } else {
          const reserveCheck = await assertOrderReservationsOk(db, { _id: order._id, items: fresh?.items });
          if (!reserveCheck.ok || fresh?.stock_conflict) {
            inventoryWarning = fresh?.stock_conflict_msg || reserveCheck.error || STOCK_GONE_MSG;
            await releaseReservationsForOrder(db, order._id, "failed_after_pay");
            await db.collection("store_orders").updateOne(
              { _id: order._id },
              {
                $set: {
                  inventory_applied: false,
                  inventory_error: inventoryWarning,
                  needs_manual_review: true,
                  updatedAt: now,
                },
              }
            );
          } else {
            const items = Array.isArray(fresh?.items) ? fresh.items : [];
            /** @type {Array<{ product_id: number, quantity: number }>} */
            const touched = [];
            try {
              for (const it of items) {
                const pid = parseInt(String(it?.product_id ?? 0), 10);
                const qty = parseInt(String(it?.quantity ?? 0), 10);
                if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(qty) || qty < 1) continue;

                const r = await db.collection("products").updateOne(
                  { _id: pid, active: { $ne: 0 }, stock: { $gte: qty } },
                  { $inc: { stock: -qty }, $set: { updatedAt: now } }
                );
                if (!r?.modifiedCount) {
                  throw Object.assign(new Error(STOCK_GONE_MSG), { code: "STOCK_RACE", product_id: pid });
                }
                touched.push({ product_id: pid, quantity: qty });
              }

              await consumeReservationsForOrder(db, order._id);
              for (const t of touched) {
                const prod = await db.collection("products").findOne({ _id: t.product_id }, { projection: { stock: 1 } });
                await recordStockMovement(db, {
                  product_id: t.product_id,
                  delta: -t.quantity,
                  reason: "venta_web",
                  order_id: order._id,
                  stock_after: Math.max(0, parseInt(String(prod?.stock ?? 0), 10) || 0),
                });
              }
              await db.collection("store_orders").updateOne(
                { _id: order._id },
                { $set: { inventory_applied: true, inventory_applied_at: now, updatedAt: now } }
              );
              inventoryApplied = true;
            } catch (e) {
              for (const t of touched) {
                try {
                  await db.collection("products").updateOne(
                    { _id: t.product_id },
                    { $inc: { stock: t.quantity }, $set: { updatedAt: now } }
                  );
                } catch {
                  /* ignore */
                }
              }
              inventoryWarning = e instanceof Error ? e.message : STOCK_GONE_MSG;
              await releaseReservationsForOrder(db, order._id, "inventory_failed");
              await db.collection("store_orders").updateOne(
                { _id: order._id },
                {
                  $set: {
                    inventory_applied: false,
                    inventory_error: inventoryWarning,
                    needs_manual_review: true,
                    updatedAt: now,
                  },
                }
              );
            }
          }
        }
        } // else productos

        // Si se aplicó inventario, vaciamos carrito y enviamos comprobante + aviso admin
        if (inventoryApplied && order.channel !== "event" && !order.event_registration_id) {
          try {
            await issueBoletaForOrder(db, order);
          } catch {
            /* ignore */
          }
          await db.collection("cart_items").deleteMany(cartMatch(actor));
          const paidOrder = await db.collection("store_orders").findOne({ _id: order._id });
          const orderForMail = paidOrder || order;
          try {
            const mailRes = await sendOrderReceipt(db, orderForMail);
            if (mailRes?.ok) {
              await db.collection("store_orders").updateOne(
                { _id: order._id },
                { $set: { receipt_email_sent: true, receipt_email_at: now } }
              );
            } else if (!mailRes?.skipped) {
              await db.collection("store_orders").updateOne(
                { _id: order._id },
                { $set: { receipt_email_sent: false, receipt_email_error: mailRes?.error || "fail", updatedAt: now } }
              );
            }
          } catch (mailErr) {
            console.warn("[receipt]", mailErr instanceof Error ? mailErr.message : mailErr);
          }
          try {
            const notifyRes = await sendOrderAdminNotify(db, orderForMail);
            if (notifyRes?.ok) {
              await db.collection("store_orders").updateOne(
                { _id: order._id },
                { $set: { admin_notify_sent: true, admin_notify_at: now } }
              );
            } else if (!notifyRes?.skipped) {
              await db.collection("store_orders").updateOne(
                { _id: order._id },
                { $set: { admin_notify_sent: false, admin_notify_error: notifyRes?.error || "fail", updatedAt: now } }
              );
            }
          } catch (notifyErr) {
            console.warn("[admin-notify]", notifyErr instanceof Error ? notifyErr.message : notifyErr);
          }
        }
      } else {
        if (order.channel !== "event" && !order.event_registration_id) {
          await releaseReservationsForOrder(db, order._id, "payment_failed");
        } else if (order.event_registration_id) {
          await db.collection("event_registrations").updateOne(
            { _id: order.event_registration_id, status: "pending_payment" },
            { $set: { status: "cancelled", cancel_reason: "payment_failed", updatedAt: now } }
          );
        }
      }

      res.json({
        ok: true,
        approved,
        status: orderStatus,
        orderId: order._id,
        boletaUrl: approved ? `/api/store/orders/${order._id}/boleta` : null,
        commit: commitResp ?? null,
        inventoryApplied,
        inventoryWarning,
        stockMessage: inventoryWarning || null,
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  async function findOrderByTuuReference(db, reference) {
    const ref = String(reference || "").trim();
    if (!ref) return null;
    const byPay = await db.collection("store_orders").findOne({
      "payment.provider": "tuu",
      $or: [{ "payment.reference": ref }, { "payment.buyOrder": ref }],
    });
    if (byPay) return byPay;
    const m = /^PS(\d+)$/i.exec(ref);
    if (m) {
      const id = parseInt(m[1], 10);
      if (Number.isFinite(id) && id > 0) {
        return db.collection("store_orders").findOne({ _id: id, "payment.provider": "tuu" });
      }
    }
    return null;
  }

  async function applyTuuNotification(db, params) {
    const cfg = await readPaymentSettings(db);
    const tuu = resolveTuuCredentials(cfg);
    const got = String(params.x_signature || "");
    const expected = signTuuParams(params, tuu.secret);
    if (!signaturesMatch(got, expected)) {
      throw Object.assign(new Error("Firma TUU inválida."), { status: 403 });
    }
    const order = await findOrderByTuuReference(db, params.x_reference);
    if (!order) throw Object.assign(new Error("Orden no encontrada."), { status: 404 });
    const paidAmount = parseInt(String(params.x_amount || ""), 10);
    const expectedAmount = Math.round(Number(order.total_cents) || 0);
    if (Number.isFinite(paidAmount) && paidAmount > 0 && paidAmount !== expectedAmount) {
      throw Object.assign(new Error("Monto TUU no coincide con la orden."), { status: 400 });
    }
    const result = params.x_result;
    const extra = { "payment.notify": params, "payment.result": result || null };
    if (tuuResultApproved(result)) {
      const settled = await settleApprovedOrder(db, order, extra);
      return { order, approved: true, ...settled };
    }
    if (tuuResultFailed(result) || String(result || "").toLowerCase() === "pending") {
      if (tuuResultFailed(result) && order.status !== "paid") {
        await failPendingOrder(db, order, params.x_message || "tuu_failed");
        await db.collection("store_orders").updateOne({ _id: order._id }, { $set: extra });
      }
      return {
        order,
        approved: false,
        inventoryApplied: false,
        inventoryWarning: null,
        pending: String(result || "").toLowerCase() === "pending",
      };
    }
    // Sin x_result: no marcar como pagada
    await db.collection("store_orders").updateOne({ _id: order._id }, { $set: { ...extra, updatedAt: new Date() } });
    return { order, approved: false, inventoryApplied: false, inventoryWarning: null, pending: true };
  }

  app.post("/api/store/checkout/tuu/callback", async (req, res) => {
    try {
      const db = await getDb();
      const params = collectTuuParams({ ...(req.query || {}), ...(req.body || {}) });
      await applyTuuNotification(db, params);
      res.status(200).type("text/plain").send("OK");
    } catch (e) {
      console.warn("[tuu-callback]", e instanceof Error ? e.message : e);
      // 200 si ya estaba pagada / duplicado con firma mala no — 403/400 hacen retry.
      const status = e.status && Number.isFinite(e.status) ? e.status : 500;
      if (status >= 500) {
        res.status(500).type("text/plain").send("ERR");
      } else {
        res.status(status).type("text/plain").send(e instanceof Error ? e.message : "ERR");
      }
    }
  });

  app.all("/api/store/checkout/tuu/complete", async (req, res) => {
    try {
      const db = await getDb();
      const base = await resolvePublicBaseUrl(req, db);
      const params = collectTuuParams({ ...(req.query || {}), ...(req.body || {}) });
      let ref = params.x_reference || "";
      let result = params.x_result || "";
      try {
        if (params.x_signature) {
          const out = await applyTuuNotification(db, params);
          ref = out.order?.payment?.reference || `PS${out.order?._id}` || ref;
          result = out.approved ? "completed" : result || "failed";
        }
      } catch (e) {
        console.warn("[tuu-complete]", e instanceof Error ? e.message : e);
        if (!result) result = "failed";
      }
      const qs = new URLSearchParams();
      if (ref) qs.set("ref", ref);
      if (result) qs.set("result", result);
      return res.redirect(303, `${base}/tuu/return?${qs.toString()}`);
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.all("/api/store/checkout/tuu/cancel", async (req, res) => {
    try {
      const db = await getDb();
      const base = await resolvePublicBaseUrl(req, db);
      const params = collectTuuParams({ ...(req.query || {}), ...(req.body || {}) });
      const ref = params.x_reference || "";
      if (ref) {
        const order = await findOrderByTuuReference(db, ref);
        if (order && order.status !== "paid") {
          await failPendingOrder(db, order, "tuu_cancelled");
        }
      }
      const qs = new URLSearchParams();
      if (ref) qs.set("ref", ref);
      qs.set("result", "cancelled");
      return res.redirect(303, `${base}/tuu/return?${qs.toString()}`);
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/checkout/tuu/status", async (req, res) => {
    try {
      const actor = await resolveCartActor(req, res);
      const db = await getDb();
      const ref = String(req.query?.ref || req.query?.reference || "").trim();
      const order = await findOrderByTuuReference(db, ref);
      if (!order) return res.status(404).json({ ok: false, error: "Orden no encontrada." });
      let allowed = false;
      if (actor.kind === "user" && Number(order.user_id) === Number(actor.userId)) allowed = true;
      if (actor.kind === "guest" && order.guest_id && order.guest_id === actor.guestId) allowed = true;
      if (!allowed) return res.status(403).json({ ok: false, error: "Sin acceso a esta orden." });
      const approved = order.status === "paid";
      res.json({
        ok: true,
        approved,
        pending: order.status === "pending_payment",
        status: order.status,
        orderId: order._id,
        boletaUrl: approved ? `/api/store/orders/${order._id}/boleta` : null,
        inventoryApplied: Boolean(order.inventory_applied),
        inventoryWarning: order.inventory_error || order.stock_conflict_msg || null,
        stockMessage: order.inventory_error || order.stock_conflict_msg || null,
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  // =========================
  // Órdenes (cliente y admin)
  // =========================
  app.get("/api/store/me/events", async (req, res) => {
    try {
      const u = await requireUser(req);
      const db = await getDb();
      const profile = await db.collection("store_users").findOne({ _id: u.id });
      const content = await readSiteContent(db);
      await expireStartedEventSales(db, content.events?.items || []);
      const email = String(u.email || "").trim().toLowerCase();
      const rows = await db
        .collection("event_registrations")
        .find({
          $or: [{ user_id: u.id }, ...(email ? [{ buyer_email: email }] : [])],
        })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();
      const seen = new Set();
      const events = [];
      for (const row of rows) {
        const id = row._id;
        if (seen.has(id)) continue;
        seen.add(id);
        const ev = await findEventById(db, row.event_id);
        events.push({
          id: row._id,
          event_id: row.event_id,
          event_title: row.event_title || ev?.title || "Evento",
          status: row.status,
          payment_method: row.payment_method || null,
          price_cents: row.price_cents || 0,
          order_id: row.order_id || null,
          createdAt: row.createdAt || null,
          paid_at: row.paid_at || null,
          date_label: ev?.date_label || null,
          place: ev?.place || null,
          starts_at: ev?.starts_at || null,
          started: ev ? eventHasStarted(ev) : false,
          image_url: ev?.image_url || null,
          game_tag: ev?.game_tag || row.event_player?.game_tag || null,
          pokemon_format: ev?.pokemon_format || null,
          myl_era: ev?.myl_era || null,
          myl_event_type: ev?.myl_event_type || null,
          myl_deck_format: ev?.myl_deck_format || null,
          myl_race: row.myl_race || row.event_player?.myl_race || null,
          event_player: row.event_player || null,
          popid: row.popid || row.event_player?.popid || null,
          cl: row.cl || row.event_player?.cl || null,
          player_name: row.player_name || row.event_player?.full_name || null,
          birth_year: row.birth_year || row.event_player?.birth_year || null,
          decklist_text: row.decklist_text || null,
          decklist_url: row.decklist_url || null,
          guardian_name: row.guardian_name || null,
          form_open: ev ? playerFormOpen(ev, row) : false,
          form_deadline: ev ? formDeadlineMs(ev, row) : null,
          can_cancel: ev ? canCustomerCancelRegistration(ev, row) : false,
          can_edit_race: ev ? playerRaceEditable(ev, row) : false,
          needs_decklist: ev ? eventNeedsDecklist(ev) : false,
          needs_guardian: ev ? playerNeedsGuardian(ev, playerSnapshotFromReg(row, ev?.game_tag), profile) : false,
          needs_form:
            Boolean(ev) &&
            !eventFormIsComplete(ev, row, profile) &&
            playerFormOpen(ev, row) &&
            row.status !== "cancelled" &&
            row.status !== "expired",
        });
      }
      res.json({ ok: true, events });
    } catch (e) {
      handleErr(res, e);
    }
  });

  async function actorOwnsEventRegistration(db, actor, row) {
    if (actor.kind === "guest" && row.guest_id && row.guest_id === actor.guestId) return true;
    if (actor.kind === "user") {
      if (Number(row.user_id) === Number(actor.userId)) return true;
      const u = await db.collection("store_users").findOne({ _id: actor.userId });
      const email = String(u?.email || "").trim().toLowerCase();
      if (email && String(row.buyer_email || "").trim().toLowerCase() === email) return true;
    }
    if (row.order_id) {
      const order = await db.collection("store_orders").findOne({ _id: row.order_id });
      if (order) {
        if (actor.kind === "user" && Number(order.user_id) === Number(actor.userId)) return true;
        if (actor.kind === "guest" && order.guest_id && order.guest_id === actor.guestId) return true;
      }
    }
    return false;
  }

  app.get("/api/store/orders/:id/event-players", async (req, res) => {
    try {
      const actor = await resolveCartActor(req, res);
      const db = await getDb();
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ ok: false, error: "id inválido." });
      const order = await db.collection("store_orders").findOne({ _id: id });
      if (!order) return res.status(404).json({ ok: false, error: "Orden no encontrada." });
      let allowed = false;
      if (actor.kind === "user" && Number(order.user_id) === Number(actor.userId)) allowed = true;
      if (actor.kind === "guest" && order.guest_id && order.guest_id === actor.guestId) allowed = true;
      if (!allowed) return res.status(403).json({ ok: false, error: "Sin acceso a esta orden." });
      const rows = await db.collection("event_registrations").find({ order_id: id }).toArray();
      const forms = [];
      for (const row of rows) {
        const ev = await findEventById(db, row.event_id);
        const tag = ev?.game_tag || row.event_player?.game_tag || "";
        const player = playerSnapshotFromReg(row, tag);
        forms.push({
          id: row._id,
          event_id: row.event_id,
          event_title: row.event_title || ev?.title || "Evento",
          status: row.status,
          game_tag: tag,
          game_tag_label: eventGameTagLabel(tag),
          event_player: player,
          popid: player.popid || null,
          cl: player.cl || null,
          player_name: player.full_name || null,
          birth_year: player.birth_year || null,
          pokemon_format: ev?.pokemon_format || null,
          myl_era: ev?.myl_era || null,
          myl_event_type: ev?.myl_event_type || null,
          myl_deck_format: ev?.myl_deck_format || null,
          myl_race: row.myl_race || player.myl_race || null,
          decklist_text: row.decklist_text || player.decklist_text || null,
          decklist_url: row.decklist_url || player.decklist_url || null,
          guardian_name: row.guardian_name || player.guardian_name || null,
          form_open: ev ? playerFormOpen(ev, row) : false,
          form_deadline: ev ? formDeadlineMs(ev, row) : null,
          can_edit_race: ev ? playerRaceEditable(ev, row) : false,
          needs_decklist: ev ? eventNeedsDecklist(ev) : false,
          needs_guardian: ev ? playerNeedsGuardian(ev, player, actor.user) : false,
          needs_form:
            Boolean(ev) &&
            !eventFormIsComplete(ev, row, actor.user) &&
            playerFormOpen(ev, row) &&
            row.status !== "cancelled" &&
            row.status !== "expired",
        });
      }
      res.json({ ok: true, forms });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.patch("/api/store/me/events/:id/player", async (req, res) => {
    try {
      const actor = await resolveCartActor(req, res);
      const db = await getDb();
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ ok: false, error: "id inválido." });
      const row = await db.collection("event_registrations").findOne({ _id: id });
      if (!row) return res.status(404).json({ ok: false, error: "Inscripción no encontrada." });
      if (row.status === "cancelled" || row.status === "expired") {
        return res.status(400).json({ ok: false, error: "Ese cupo ya no está activo." });
      }
      const owns = await actorOwnsEventRegistration(db, actor, row);
      if (!owns) return res.status(403).json({ ok: false, error: "Sin acceso a esta inscripción." });
      const ev = await findEventById(db, row.event_id);
      const tag = ev?.game_tag || row.event_player?.game_tag || "";
      if (!eventNeedsPlayerForm(tag)) {
        return res.status(400).json({ ok: false, error: "Este evento no pide datos de jugador." });
      }
      const profile =
        actor.kind === "user" ? await db.collection("store_users").findOne({ _id: actor.userId }) : null;
      const canEdit =
        tag === "mitos-y-leyendas" ? playerDataEditable(ev, row) : playerFormOpen(ev, row);
      if (!canEdit) {
        return res.status(400).json({
          ok: false,
          error:
            tag === "mitos-y-leyendas"
              ? "Ya no se puede cambiar la raza: el torneo comenzó."
              : "Se acabó el plazo para enviar los datos (24 h antes del inicio, o hasta que empiece si compraste tarde).",
        });
      }
      const event_player = parseEventPlayer(tag, req.body);
      if (tag === "mitos-y-leyendas") {
        event_player.myl_race = parseMylRace(req.body?.myl_race || event_player.myl_race, ev?.myl_era);
        event_player.myl_race_label = mylRaceLabel(event_player.myl_race, ev?.myl_era);
      }
      const minA = eventMinAge(ev || {});
      const age = playerAgeAt(ev, event_player, profile);
      if (age != null && age < minA) {
        return res.status(400).json({ ok: false, error: `El jugador debe tener al menos ${minA} años.` });
      }
      const extras = {};
      if (eventNeedsDecklist(ev)) {
        Object.assign(extras, parseDecklist(req.body, { required: true }));
      }
      if (playerNeedsGuardian(ev, event_player, profile)) {
        Object.assign(extras, parseGuardian(req.body, { required: true }));
        if (extras.guardian_rut) {
          try {
            const parsed = assertValidRut(extras.guardian_rut);
            extras.guardian_rut = parsed.formatted;
          } catch {
            return res.status(400).json({ ok: false, error: "RUT del tutor inválido." });
          }
        }
      }
      const dup = await findDuplicatePlayerCode(db, {
        eventId: row.event_id,
        excludeRegId: row._id,
        popid: event_player.popid,
        cl: event_player.cl,
      });
      if (dup) {
        return res.status(409).json({
          ok: false,
          error: event_player.popid
            ? "Ese POPID ya está inscrito en este torneo."
            : "Ese CL ya está inscrito en este torneo.",
        });
      }
      const storedPlayer = { ...event_player, ...extras };
      await db.collection("event_registrations").updateOne(
        { _id: id },
        {
          $set: {
            event_player: storedPlayer,
            popid: event_player.popid || null,
            cl: event_player.cl || null,
            player_name: event_player.full_name || null,
            birth_year: event_player.birth_year || null,
            decklist_text: extras.decklist_text || null,
            decklist_url: extras.decklist_url || null,
            guardian_name: extras.guardian_name || null,
            guardian_rut: extras.guardian_rut || null,
            myl_race: event_player.myl_race || null,
            updatedAt: new Date().toISOString(),
          },
        }
      );

      let userId = row.user_id || (actor.kind === "user" ? actor.userId : null);
      let buyerEmail = String(row.buyer_email || "").trim().toLowerCase();
      let buyerName = String(row.buyer_name || event_player.full_name || "").trim();
      if (row.order_id) {
        const order = await db.collection("store_orders").findOne({ _id: row.order_id });
        if (order) {
          if (!buyerEmail) {
            buyerEmail = String(order.buyer_email || order.fulfillment?.email || "").trim().toLowerCase();
          }
          if (!buyerName) {
            buyerName = String(order.fulfillment?.recipient || order.buyer_name || "").trim();
          }
          if (!userId && order.user_id) userId = order.user_id;
        }
      }
      if (!userId && buyerEmail) {
        const byMail = await db.collection("store_users").findOne({ email: buyerEmail }, { projection: { _id: 1 } });
        if (byMail) userId = byMail._id;
      }
      let updatedUser = null;
      if (userId) {
        const profile = await db.collection("store_users").findOne({ _id: userId });
        if (profile && !profile.deleted_at) {
          if (!buyerEmail) buyerEmail = String(profile.email || "").trim().toLowerCase();
          if (!buyerName) buyerName = String(profile.name || "").trim();
          const profilePatch = missingUserFieldsFromPlayer(profile, event_player);
          if (Object.keys(profilePatch).length) {
            await db.collection("store_users").updateOne(
              { _id: userId },
              { $set: { ...profilePatch, updatedAt: new Date() } }
            );
          }
          const fresh = await db.collection("store_users").findOne({ _id: userId });
          updatedUser = publicUserPayload(fresh);
        }
      }

      try {
        await sendEventPlayerFormMails(db, {
          buyerEmail,
          buyerName,
          eventTitle: row.event_title || ev?.title || "Evento",
          orderId: row.order_id || null,
          registrationId: row._id,
          player: storedPlayer,
        });
      } catch (mailErr) {
        console.error("[mail] event player form", mailErr);
      }

      res.json({ ok: true, event_player: storedPlayer, user: updatedUser });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/me/events/:id/cancel", async (req, res) => {
    try {
      const actor = await resolveCartActor(req, res);
      const db = await getDb();
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ ok: false, error: "id inválido." });
      const row = await db.collection("event_registrations").findOne({ _id: id });
      if (!row) return res.status(404).json({ ok: false, error: "Inscripción no encontrada." });
      const owns = await actorOwnsEventRegistration(db, actor, row);
      if (!owns) return res.status(403).json({ ok: false, error: "Sin acceso a esta inscripción." });
      const ev = await findEventById(db, row.event_id);
      if (!canCustomerCancelRegistration(ev, row)) {
        return res.status(400).json({
          ok: false,
          error:
            "No se puede cancelar: pasó el plazo de arrepentimiento o el evento ya empezó. El cupo no se transfiere por la web; habla con la tienda.",
        });
      }
      await releaseEventRegistration(db, row, "customer");
      res.json({
        ok: true,
        message:
          row.status === "paid"
            ? "Cupo liberado. Si pagaste en línea, el reembolso lo resuelve la tienda."
            : "Cupo cancelado y liberado.",
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

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
      const prevOrder = await db.collection("store_orders").findOne({ _id: id });
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
      let mail = null;
      if (order && prevOrder && String(prevOrder.status) !== next) {
        const notifyStatuses = new Set(["paid", "processing", "shipped", "completed", "cancelled", "refunded"]);
        if (notifyStatuses.has(next)) {
          try {
            mail = await sendOrderStatusUpdate(db, order, next, String(req.body?.note || "").trim());
          } catch (e) {
            mail = { ok: false, error: e instanceof Error ? e.message : String(e) };
          }
        }
      }
      res.json({ ok: true, order, mail });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/admin/orders/:id/refund", async (req, res) => {
    try {
      const admin = await requireAdmin(req);
      const db = await getDb();
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ ok: false, error: "id inválido." });
      const order = await db.collection("store_orders").findOne({ _id: id });
      if (!order) return res.status(404).json({ ok: false, error: "Orden no encontrada." });
      if (order.status === "refunded") return res.json({ ok: true, order, message: "Ya estaba reembolsada." });
      const paidLike = new Set(["paid", "processing", "shipped", "completed"]);
      if (!paidLike.has(String(order.status))) {
        return res.status(400).json({ ok: false, error: "Solo se pueden reembolsar órdenes pagadas." });
      }

      const amountRaw = req.body?.amount_cents != null ? parseInt(String(req.body.amount_cents), 10) : NaN;
      const amount =
        Number.isFinite(amountRaw) && amountRaw > 0
          ? amountRaw
          : Math.max(0, parseInt(String(order.total_cents ?? 0), 10) || 0);
      if (amount < 1) return res.status(400).json({ ok: false, error: "Monto de reembolso inválido." });

      const provider = String(order.payment?.provider || "");
      const token = String(order.payment?.token || "").trim();
      let refundResp = null;

      if (provider === "webpay_mock" || (await isWebpayMock(db))) {
        refundResp = { status: "REVERSED", mock: true, amount };
      } else if (provider === "webpay" && token) {
        try {
          const tx = await makeWebpayTx(db);
          refundResp = await tx.refund(token, amount);
        } catch (e) {
          const detail = e instanceof Error ? e.message : String(e);
          return res.status(502).json({ ok: false, error: `Webpay rechazó el reembolso: ${detail}` });
        }
      } else {
        return res.status(400).json({
          ok: false,
          error: "Esta orden no tiene pago Webpay reembolsable. Marca el estado manualmente si corresponde.",
        });
      }

      const now = new Date();
      await db.collection("store_orders").updateOne(
        { _id: id },
        {
          $set: {
            status: "refunded",
            refund: {
              amount_cents: amount,
              at: now,
              by: { id: admin.id, email: admin.email, name: admin.name },
              provider,
              response: refundResp,
            },
            updatedAt: now,
          },
          $push: {
            history: {
              at: now,
              by: { id: admin.id, email: admin.email, name: admin.name },
              status: "refunded",
              note: String(req.body?.note || `Reembolso Webpay $${amount.toLocaleString("es-CL")}`).slice(0, 500),
            },
          },
        }
      );
      const updated = await db.collection("store_orders").findOne({ _id: id });
      let mail = null;
      try {
        mail = await sendOrderStatusUpdate(db, updated, "refunded", String(req.body?.note || "").trim());
      } catch (e) {
        mail = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      res.json({ ok: true, order: updated, refund: refundResp, mail, message: "Reembolso procesado." });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/admin/orders/:id/boleta", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ ok: false, error: "id inválido." });
      const order = await db.collection("store_orders").findOne({ _id: id });
      if (!order) return res.status(404).json({ ok: false, error: "Orden no encontrada." });
      const boleta = await issueBoletaForOrder(db, order);
      const fresh = await db.collection("store_orders").findOne({ _id: id });
      res.json({ ok: true, boleta, order: fresh });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/orders/:id/boleta", async (req, res) => {
    try {
      const db = await getDb();
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ ok: false, error: "id inválido." });
      const order = await db.collection("store_orders").findOne({ _id: id });
      if (!order) return res.status(404).json({ ok: false, error: "Orden no encontrada." });

      let allowed = false;
      try {
        const u = await requireUser(req);
        if (u.role === "admin" || Number(order.user_id) === Number(u.id)) allowed = true;
      } catch {
        /* guest / no sesión */
      }
      if (!allowed) {
        const actor = await resolveCartActor(req, res);
        if (actor.kind === "guest" && order.guest_id && order.guest_id === actor.guestId) allowed = true;
        if (actor.kind === "user" && Number(order.user_id) === Number(actor.userId)) allowed = true;
      }
      if (!allowed) return res.status(403).json({ ok: false, error: "Sin acceso a esta boleta." });

      const boleta = order.boleta?.folio ? order.boleta : await issueBoletaForOrder(db, order);
      const fresh = await db.collection("store_orders").findOne({ _id: id });
      const base = await resolvePublicBaseUrl(req, db);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(
        boletaHtml(fresh || order, boleta, {
          logoUrl: `${base}/receipt_logo.png`,
          baseUrl: base,
        })
      );
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/admin/ops", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const ops = await readStoreOps(db);
      res.json({ ok: true, ops, db_driver: getDbDriver() });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.patch("/api/store/admin/ops", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const ops = await saveStoreOps(db, req.body || {});
      res.json({ ok: true, ops, message: "Ajustes guardados." });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/admin/backup", async (req, res) => {
    try {
      await requireAdmin(req);
      const driver = getDbDriver();
      if (driver === "sqlite") {
        const { flushSqlitePersist, dbFilePath } = await import("./sqliteMongo.mjs");
        flushSqlitePersist();
        // dbFilePath may not be exported — check
        const mod = await import("./sqliteMongo.mjs");
        const filePath =
          typeof mod.dbFilePath === "function"
            ? mod.dbFilePath()
            : path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "local.sqlite");
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ ok: false, error: "Archivo SQLite no encontrado." });
        }
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="plasma-store-backup-${stamp}.sqlite"`);
        fs.createReadStream(filePath).pipe(res);
        return;
      }
      const db = await getDb();
      const collections = [
        "store_users",
        "store_orders",
        "products",
        "store_settings",
        "event_registrations",
        "store_tags",
        "cart_items",
      ];
      /** @type {Record<string, unknown[]>} */
      const dump = {};
      for (const name of collections) {
        try {
          dump[name] = await db.collection(name).find({}).limit(20000).toArray();
        } catch {
          dump[name] = [];
        }
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="plasma-store-backup-${stamp}.json"`);
      res.send(JSON.stringify({ exported_at: new Date().toISOString(), driver, collections: dump }, null, 2));
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/admin/2fa", async (req, res) => {
    try {
      const u = await requireAdmin(req);
      const db = await getDb();
      const row = await db.collection("store_users").findOne(
        { _id: u.id },
        { projection: { totp_enabled: 1, email: 1 } }
      );
      res.json({
        ok: true,
        enabled: Boolean(row?.totp_enabled),
        email: row?.email || u.email,
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/admin/2fa/setup", async (req, res) => {
    try {
      const u = await requireAdmin(req);
      const db = await getDb();
      const secret = generateTotpSecret();
      await db.collection("store_users").updateOne(
        { _id: u.id },
        { $set: { totp_secret_pending: secret, updatedAt: new Date() } }
      );
      res.json({
        ok: true,
        secret,
        qr_url: totpOtpauthUrl(secret, u.email || "admin"),
        message: "Escanea el QR y confirma con un código.",
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/admin/2fa/enable", async (req, res) => {
    try {
      const u = await requireAdmin(req);
      const db = await getDb();
      const code = String(req.body?.code || "").trim();
      const row = await db.collection("store_users").findOne(
        { _id: u.id },
        { projection: { totp_secret_pending: 1, totp_secret: 1 } }
      );
      const secret = row?.totp_secret_pending || row?.totp_secret;
      if (!secret) return res.status(400).json({ ok: false, error: "Primero inicia la configuración 2FA." });
      if (!verifyTotp(String(secret), code)) return res.status(400).json({ ok: false, error: "Código inválido." });
      await db.collection("store_users").updateOne(
        { _id: u.id },
        {
          $set: { totp_secret: secret, totp_enabled: true, updatedAt: new Date() },
          $unset: { totp_secret_pending: "" },
        }
      );
      res.json({ ok: true, enabled: true, message: "2FA activado." });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/admin/2fa/disable", async (req, res) => {
    try {
      const u = await requireAdmin(req);
      const db = await getDb();
      const code = String(req.body?.code || "").trim();
      const password = String(req.body?.password || "").trim();
      const row = await db.collection("store_users").findOne({ _id: u.id });
      if (!row?.pass_hash) return res.status(400).json({ ok: false, error: "Cuenta inválida." });
      const passOk = await bcrypt.compare(password, String(row.pass_hash));
      if (!passOk) return res.status(401).json({ ok: false, error: "Contraseña incorrecta." });
      if (row.totp_enabled && row.totp_secret && !verifyTotp(String(row.totp_secret), code)) {
        return res.status(401).json({ ok: false, error: "Código 2FA incorrecto." });
      }
      await db.collection("store_users").updateOne(
        { _id: u.id },
        {
          $set: { totp_enabled: false, updatedAt: new Date() },
          $unset: { totp_secret: "", totp_secret_pending: "" },
        }
      );
      res.json({ ok: true, enabled: false, message: "2FA desactivado." });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/admin/orders/:id/shipping-proof", (req, res) => {
    uploadShippingProof.single("file")(req, res, async (err) => {
      if (err) return res.status(400).json({ ok: false, error: err.message || "Archivo inválido." });
      try {
        const admin = await requireAdmin(req);
        const db = await getDb();
        const id = parseInt(String(req.params.id), 10);
        if (!Number.isFinite(id) || id < 1) return res.status(400).json({ ok: false, error: "id inválido." });
        const order = await db.collection("store_orders").findOne({ _id: id });
        if (!order) return res.status(404).json({ ok: false, error: "Orden no encontrada." });

        const tracking_code = String(req.body?.tracking_code || req.body?.tracking || "").trim().slice(0, 80);
        const note = String(req.body?.note || "").trim().slice(0, 300);
        const fileUrl = shippingProofUrl(req.file);
        if (!fileUrl && !tracking_code) {
          return res.status(400).json({
            ok: false,
            error: "Adjunta un archivo (imagen/PDF) o indica un código de seguimiento.",
          });
        }

        const prev = order.shipping_proof && typeof order.shipping_proof === "object" ? order.shipping_proof : {};
        const now = new Date();
        /** @type {Record<string, unknown>} */
        const shipping_proof = {
          ...prev,
          updatedAt: now,
          uploaded_by: { id: admin.id, email: admin.email, name: admin.name },
        };
        if (fileUrl) {
          if (prev.url && typeof prev.url === "string" && prev.url.startsWith("/store-media/")) {
            deleteStoredImageFile(uploadRoot, prev.url);
          }
          shipping_proof.url = fileUrl;
          shipping_proof.filename = req.file?.originalname || req.file?.filename || "comprobante";
          shipping_proof.mimetype = req.file?.mimetype || null;
          shipping_proof.size = req.file?.size || null;
        }
        if (tracking_code) shipping_proof.tracking_code = tracking_code;
        else if (prev.tracking_code) shipping_proof.tracking_code = prev.tracking_code;
        if (note) shipping_proof.note = note;

        await db.collection("store_orders").updateOne(
          { _id: id },
          {
            $set: { shipping_proof, updatedAt: now },
            $push: {
              history: {
                at: now,
                by: { id: admin.id, email: admin.email, name: admin.name },
                status: order.status,
                note: tracking_code
                  ? `Comprobante de envío adjunto${fileUrl ? "" : ""} · seguimiento: ${tracking_code}`
                  : "Comprobante de envío adjunto",
              },
            },
          }
        );
        const updated = await db.collection("store_orders").findOne({ _id: id });
        res.json({
          ok: true,
          order: updated,
          message: "Comprobante de envío guardado.",
        });
      } catch (e) {
        handleErr(res, e);
      }
    });
  });

  app.delete("/api/store/admin/orders/:id/shipping-proof", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ ok: false, error: "id inválido." });
      const order = await db.collection("store_orders").findOne({ _id: id });
      if (!order) return res.status(404).json({ ok: false, error: "Orden no encontrada." });
      const prev = order.shipping_proof;
      if (prev?.url && typeof prev.url === "string") deleteStoredImageFile(uploadRoot, prev.url);
      await db.collection("store_orders").updateOne(
        { _id: id },
        { $unset: { shipping_proof: "" }, $set: { updatedAt: new Date() } }
      );
      const updated = await db.collection("store_orders").findOne({ _id: id });
      res.json({ ok: true, order: updated, message: "Comprobante eliminado." });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/admin/orders/:id/resend-mail", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ ok: false, error: "id inválido." });
      const order = await db.collection("store_orders").findOne({ _id: id });
      if (!order) return res.status(404).json({ ok: false, error: "Orden no encontrada." });
      const paidOk = ["paid", "processing", "shipped", "completed"].includes(String(order.status || ""));
      if (!paidOk) {
        return res.status(400).json({ ok: false, error: "Solo se reenvían correos de órdenes pagadas." });
      }
      const now = new Date();
      const receipt = await sendOrderReceipt(db, order);
      const notify = await sendOrderAdminNotify(db, order);
      const patch = { updatedAt: now };
      if (receipt?.ok) {
        patch.receipt_email_sent = true;
        patch.receipt_email_at = now;
        patch.receipt_email_error = null;
      } else if (!receipt?.skipped) {
        patch.receipt_email_sent = false;
        patch.receipt_email_error = receipt?.error || "fail";
      }
      if (notify?.ok) {
        patch.admin_notify_sent = true;
        patch.admin_notify_at = now;
        patch.admin_notify_error = null;
      } else if (!notify?.skipped) {
        patch.admin_notify_sent = false;
        patch.admin_notify_error = notify?.error || "fail";
      }
      await db.collection("store_orders").updateOne({ _id: id }, { $set: patch });
      const friendlyFail = (err) =>
        /BadCredentials|Username and Password not accepted/i.test(String(err || ""))
          ? "Gmail rechazó la contraseña SMTP. Corrígela en Admin → Correo (contraseña de aplicaciones)."
          : err;
      if (!receipt?.ok && !receipt?.skipped) {
        return res.status(400).json({
          ok: false,
          error: friendlyFail(receipt?.error) || "No se pudo enviar el comprobante.",
          receipt,
          notify,
        });
      }
      if (!notify?.ok && !notify?.skipped) {
        return res.status(400).json({
          ok: false,
          error: friendlyFail(notify?.error) || "Comprobante OK, pero falló el aviso al admin.",
          receipt,
          notify,
        });
      }
      res.json({
        ok: true,
        message: "Correos reenviados.",
        receipt: { ok: receipt?.ok, skipped: receipt?.skipped },
        notify: { ok: notify?.ok, skipped: notify?.skipped },
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
      const actor = await resolveCartActor(req, res);
      const db = await getDb();
      await expireReservations(db);
      const rows = await db
        .collection("cart_items")
        .aggregate([
          { $match: cartMatch(actor) },
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
              compare_price_cents: "$p.compare_price_cents",
              discount_percent: "$p.discount_percent",
              promo_min_qty: "$p.promo_min_qty",
              promo_bundle_total_cents: "$p.promo_bundle_total_cents",
              stock: "$p.stock",
              sales_channel: "$p.sales_channel",
              active: "$p.active",
              image_url: "$p.image_url",
              product_kind: "$p.product_kind",
              event_id: "$p.event_id",
              event_player: 1,
            },
          },
        ])
        .toArray();

      const items = [];
      for (const row of rows) {
        if (row.active === 0 || !isWebSellable(row)) continue;
        const available = await availableForWeb(db, { _id: row.productId, stock: row.stock });
        const qty = parseInt(String(row.quantity ?? 0), 10) || 0;
        const pricing = effectiveLinePricing(row, qty);
        items.push({
          productId: row.productId,
          quantity: qty,
          name: row.name,
          price_cents: pricing.unit_price_cents,
          list_price_cents: pricing.list_price_cents,
          line_total_cents: pricing.line_total_cents,
          discount_percent: pricing.discount_percent,
          promo_applied: pricing.promo_applied,
          promo_min_qty: Math.max(0, parseInt(String(row.promo_min_qty ?? 0), 10) || 0),
          promo_bundle_total_cents: Math.max(0, parseInt(String(row.promo_bundle_total_cents ?? 0), 10) || 0),
          stock: available,
          image_url: row.image_url || null,
          product_kind: isEventProduct(row) ? "event" : "product",
          event_id: parseInt(String(row.event_id ?? 0), 10) || null,
          event_player: row.event_player || null,
        });
      }
      res.json({ ok: true, items, guest: actor.kind === "guest" });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/cart", async (req, res) => {
    try {
      const actor = await resolveCartActor(req, res);
      const db = await getDb();
      await expireReservations(db);
      const productId = parseInt(String(req.body?.productId), 10);
      let quantity = parseInt(String(req.body?.quantity ?? "1"), 10);
      if (!Number.isFinite(productId) || productId < 1) return res.status(400).json({ ok: false, error: "productId inválido." });
      if (!Number.isFinite(quantity) || quantity < 1) quantity = 1;
      const prod = await db.collection("products").findOne({ _id: productId, active: { $ne: 0 } });
      if (!prod || !isWebSellable(prod)) return res.status(404).json({ ok: false, error: "Producto no disponible en la tienda online." });
      if (isEventProduct(prod)) {
        quantity = 1;
        if (actor.kind !== "user") {
          return res.status(401).json({ ok: false, error: "Inicia sesión para agregar un cupo." });
        }
        const ev = prod.event_id ? await findEventById(db, prod.event_id) : null;
        if (ev && eventHasStarted(ev)) {
          return res.status(400).json({ ok: false, error: "El evento ya comenzó. Ese cupo ya no se puede agregar." });
        }
        if (ev) {
          const profile = await db.collection("store_users").findOne({ _id: actor.userId });
          try {
            await assertUserCanTakeEventCup(db, ev, {
              userId: actor.userId,
              email: profile?.email,
            });
          } catch (pe) {
            return res.status(pe.status || 409).json({ ok: false, error: pe.message });
          }
          const minA = eventMinAge(ev);
          const age = playerAgeAt(ev, { birth_year: profile?.birth_year }, profile);
          if (age != null && age < minA) {
            return res.status(400).json({
              ok: false,
              error: `Este torneo pide ${minA} años mínimo. Revisa la fecha de nacimiento de la cuenta.`,
            });
          }
        }
      }
      const match = { ...cartMatch(actor), product_id: productId };
      const existing = await db.collection("cart_items").findOne(match);
      const nextQty = isEventProduct(prod) ? 1 : (existing?.quantity || 0) + quantity;
      const avail = await availableForWeb(db, prod);
      if (nextQty > avail) {
        return res.status(400).json({
          ok: false,
          error: avail <= 0 ? STOCK_GONE_MSG : `Stock insuficiente (máx. ${avail}).`,
        });
      }
      const setDoc =
        actor.kind === "user"
          ? { user_id: actor.userId, product_id: productId, quantity: nextQty }
          : { guest_id: actor.guestId, product_id: productId, quantity: nextQty };
      await db.collection("cart_items").updateOne(match, { $set: setDoc }, { upsert: true });
      res.json({ ok: true, guest: actor.kind === "guest" });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.patch("/api/store/cart", async (req, res) => {
    try {
      const actor = await resolveCartActor(req, res);
      const db = await getDb();
      await expireReservations(db);
      const productId = parseInt(String(req.body?.productId), 10);
      let quantity = parseInt(String(req.body?.quantity), 10);
      if (!Number.isFinite(productId) || productId < 1) return res.status(400).json({ ok: false, error: "productId inválido." });
      if (!Number.isFinite(quantity) || quantity < 1) return res.status(400).json({ ok: false, error: "quantity debe ser >= 1." });
      const prod = await db.collection("products").findOne({ _id: productId, active: { $ne: 0 } });
      if (!prod || !isWebSellable(prod)) return res.status(404).json({ ok: false, error: "Producto no disponible en la tienda online." });
      if (isEventProduct(prod)) quantity = 1;
      const avail = await availableForWeb(db, prod);
      if (quantity > avail) {
        return res.status(400).json({
          ok: false,
          error: avail <= 0 ? STOCK_GONE_MSG : `Stock insuficiente (máx. ${avail}).`,
        });
      }
      const r = await db.collection("cart_items").updateOne(
        { ...cartMatch(actor), product_id: productId },
        { $set: { quantity } }
      );
      if (r.matchedCount === 0) return res.status(404).json({ ok: false, error: "Ítem no en el carrito." });
      res.json({ ok: true });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.delete("/api/store/cart", async (req, res) => {
    try {
      const actor = await resolveCartActor(req, res);
      const db = await getDb();
      await db.collection("cart_items").deleteMany(cartMatch(actor));
      res.json({ ok: true });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.delete("/api/store/cart/:productId", async (req, res) => {
    try {
      const actor = await resolveCartActor(req, res);
      const db = await getDb();
      const productId = parseInt(req.params.productId, 10);
      await db.collection("cart_items").deleteMany({ ...cartMatch(actor), product_id: productId });
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
      const activeProducts = await db
        .collection("products")
        .find({ active: { $ne: 0 } })
        .project({ name: 1, stock: 1, min_stock: 1 })
        .toArray();
      const minStockAlerts = activeProducts
        .filter((p) => {
          const min = Math.max(0, parseInt(String(p.min_stock ?? 0), 10) || 0);
          if (min <= 0) return false;
          const stock = Math.max(0, parseInt(String(p.stock ?? 0), 10) || 0);
          return stock <= min;
        })
        .map((p) => ({
          id: p._id,
          name: p.name,
          stock: Math.max(0, parseInt(String(p.stock ?? 0), 10) || 0),
          min_stock: Math.max(0, parseInt(String(p.min_stock ?? 0), 10) || 0),
        }))
        .slice(0, 40);
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
          lowStockByMin: minStockAlerts.length,
          minStockAlerts,
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

  /**
   * Inversión / recuperación / ganancia (estilo POS) + series para gráficos.
   * Query: from, to (YYYY-MM-DD), product_id, category, subcategory
   */
  app.get("/api/store/admin/finance", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();

      const today = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const toIsoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const defaultTo = toIsoDay(today);
      const dFrom = new Date(today);
      dFrom.setDate(dFrom.getDate() - 7);
      const defaultFrom = toIsoDay(dFrom);

      const dayFrom = String(req.query?.from || defaultFrom).trim().slice(0, 10);
      const dayTo = String(req.query?.to || defaultTo).trim().slice(0, 10);
      const productIdRaw = parseInt(String(req.query?.product_id || ""), 10);
      const productId = Number.isFinite(productIdRaw) && productIdRaw > 0 ? productIdRaw : null;
      const categoryFilter = String(req.query?.category || "").trim();
      const subcategoryFilter = String(req.query?.subcategory || "").trim();

      const start = new Date(`${dayFrom}T00:00:00`);
      const end = new Date(`${dayTo}T23:59:59.999`);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
        return res.status(400).json({ ok: false, error: "Rango de fechas inválido." });
      }

      const products = await db.collection("products").find({}).toArray();
      const productById = new Map(products.map((p) => [p._id, p]));

      const matchesProductFilter = (p) => {
        if (!p) return false;
        if (productId != null && Number(p._id) !== productId) return false;
        if (categoryFilter) {
          const cat = String(p.category || "").trim();
          const tags = Array.isArray(p.tags) ? p.tags.map(String) : [];
          const slug = slugify(categoryFilter);
          if (cat !== categoryFilter && !tags.includes(slug) && slugify(cat) !== slug) return false;
        }
        if (subcategoryFilter) {
          const sub = String(p.subcategory || "").trim();
          const tags = Array.isArray(p.tags) ? p.tags.map(String) : [];
          const slug = slugify(subcategoryFilter);
          if (sub !== subcategoryFilter && !tags.includes(slug) && slugify(sub) !== slug) return false;
        }
        return true;
      };

      let invested = 0;
      /** @type {Map<string, { category: string, subcategory: string, investment: number, revenue: number, cost_sold: number, qty_sold: number }>} */
      const byLabel = new Map();
      const labelKey = (cat, sub) => `${cat || "(sin etiqueta)"}|||${sub || "(sin subetiqueta)"}`;

      for (const p of products) {
        if (!matchesProductFilter(p)) continue;
        const stock = Math.max(0, parseInt(String(p.stock ?? 0), 10) || 0);
        const cost = Math.max(0, parseInt(String(p.cost_cents ?? 0), 10) || 0);
        const inv = stock * cost;
        invested += inv;
        const cat = String(p.category || "").trim() || "(sin etiqueta)";
        const sub = String(p.subcategory || "").trim() || "(sin subetiqueta)";
        const k = labelKey(cat, sub);
        const row = byLabel.get(k) || { category: cat, subcategory: sub, investment: 0, revenue: 0, cost_sold: 0, qty_sold: 0 };
        row.investment += inv;
        byLabel.set(k, row);
      }

      const paidStatuses = new Set(["paid", "processing", "shipped", "completed"]);
      const orders = await db
        .collection("store_orders")
        .find({ status: { $in: [...paidStatuses] } })
        .toArray();

      let revenue = 0;
      let costSold = 0;
      let saleCount = 0;
      /** @type {Map<string, { day: string, revenue: number, profit: number, orders: number }>} */
      const byDay = new Map();

      for (const order of orders) {
        const created = order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt);
        if (Number.isNaN(created.getTime()) || created < start || created > end) continue;

        const items = Array.isArray(order.items) ? order.items : [];
        let orderRevenue = 0;
        let orderCost = 0;
        let orderMatched = false;

        for (const it of items) {
          const pid = parseInt(String(it.product_id ?? it.productId ?? 0), 10);
          const qty = parseInt(String(it.quantity ?? 0), 10) || 0;
          if (!Number.isFinite(pid) || qty < 1) continue;
          const prod = productById.get(pid);
          if (!matchesProductFilter(prod || { _id: pid })) continue;
          orderMatched = true;
          const unitPrice = Math.max(0, parseInt(String(it.price_cents ?? prod?.price_cents ?? 0), 10) || 0);
          const unitCost = Math.max(
            0,
            parseInt(String(it.cost_cents ?? prod?.cost_cents ?? 0), 10) || 0
          );
          const lineRev = unitPrice * qty;
          const lineCost = unitCost * qty;
          orderRevenue += lineRev;
          orderCost += lineCost;

          const cat = String(prod?.category || "").trim() || "(sin etiqueta)";
          const sub = String(prod?.subcategory || "").trim() || "(sin subetiqueta)";
          const k = labelKey(cat, sub);
          const row = byLabel.get(k) || { category: cat, subcategory: sub, investment: 0, revenue: 0, cost_sold: 0, qty_sold: 0 };
          row.revenue += lineRev;
          row.cost_sold += lineCost;
          row.qty_sold += qty;
          byLabel.set(k, row);
        }

        // Si no hay ítems pero el filtro es global, usa total de la orden
        if (!items.length && productId == null && !categoryFilter && !subcategoryFilter) {
          orderMatched = true;
          orderRevenue = Math.max(0, parseInt(String(order.total_cents ?? order.subtotal_cents ?? 0), 10) || 0);
        }

        if (!orderMatched) continue;
        saleCount += 1;
        revenue += orderRevenue;
        costSold += orderCost;

        const dayKey = toIsoDay(created);
        const dayRow = byDay.get(dayKey) || { day: dayKey, revenue: 0, profit: 0, orders: 0 };
        dayRow.revenue += orderRevenue;
        dayRow.profit += orderRevenue - orderCost;
        dayRow.orders += 1;
        byDay.set(dayKey, dayRow);
      }

      const profit = revenue - costSold;

      // Rellenar días vacíos del rango
      const daysSeries = [];
      const cursor = new Date(start);
      cursor.setHours(0, 0, 0, 0);
      const endDay = new Date(end);
      endDay.setHours(0, 0, 0, 0);
      while (cursor <= endDay) {
        const key = toIsoDay(cursor);
        daysSeries.push(byDay.get(key) || { day: key, revenue: 0, profit: 0, orders: 0 });
        cursor.setDate(cursor.getDate() + 1);
      }

      const byLabelList = [...byLabel.values()]
        .map((r) => ({
          ...r,
          profit: r.revenue - r.cost_sold,
        }))
        .filter((r) => r.investment > 0 || r.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue || b.investment - a.investment)
        .slice(0, 40);

      const categories = [
        ...new Set(
          products
            .map((p) => String(p.category || "").trim())
            .filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b));
      const subcategories = [
        ...new Set(
          products
            .map((p) => String(p.subcategory || "").trim())
            .filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b));
      const productOptions = products
        .map((p) => ({ id: p._id, name: p.name || `#${p._id}` }))
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        ok: true,
        finance: {
          from: dayFrom,
          to: dayTo,
          invested,
          revenue,
          profit,
          cost_sold: costSold,
          sale_count: saleCount,
          by_day: daysSeries,
          by_label: byLabelList,
          filters: {
            products: productOptions,
            categories,
            subcategories,
          },
        },
      });
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

  app.get("/api/store/admin/products/export.csv", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const rows = await db.collection("products").find({}).sort({ _id: 1 }).toArray();
      const header = [
        "id",
        "name",
        "barcode",
        "category",
        "subcategory",
        "price_cents",
        "compare_price_cents",
        "cost_cents",
        "stock",
        "min_stock",
        "discount_percent",
        "promo_min_qty",
        "promo_bundle_total_cents",
        "sales_channel",
        "active",
        "tags",
      ];
      const lines = [header.join(",")];
      for (const p of rows) {
        lines.push(
          [
            p._id,
            csvEscape(p.name),
            csvEscape(p.barcode),
            csvEscape(p.category),
            csvEscape(p.subcategory),
            p.price_cents || 0,
            p.compare_price_cents ?? "",
            p.cost_cents || 0,
            p.stock || 0,
            p.min_stock || 0,
            p.discount_percent || 0,
            p.promo_min_qty || 0,
            p.promo_bundle_total_cents || 0,
            normalizeSalesChannel(p.sales_channel),
            p.active ? 1 : 0,
            csvEscape(Array.isArray(p.tags) ? p.tags.join("|") : ""),
          ].join(",")
        );
      }
      const body = lines.join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="productos-plasma-store.csv"');
      res.send("\uFEFF" + body);
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/admin/inventory/movements", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query?.limit ?? "80"), 10) || 80));
      const productId = parseInt(String(req.query?.product_id ?? ""), 10);
      const filter = {};
      if (Number.isFinite(productId) && productId > 0) filter.product_id = productId;
      const movements = await db
        .collection("stock_movements")
        .find(filter)
        .sort({ _id: -1 })
        .limit(limit)
        .toArray();
      res.json({
        ok: true,
        movements: movements.map((m) => ({
          id: m._id,
          product_id: m.product_id,
          delta: m.delta,
          reason: m.reason,
          note: m.note,
          order_id: m.order_id,
          stock_after: m.stock_after,
          by: m.by,
          createdAt: m.createdAt,
        })),
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/admin/inventory/adjust", async (req, res) => {
    try {
      const admin = await requireAdmin(req);
      const db = await getDb();
      const productId = parseInt(String(req.body?.product_id ?? req.body?.productId ?? 0), 10);
      const delta = parseInt(String(req.body?.delta ?? 0), 10);
      const note = String(req.body?.note || "").trim().slice(0, 300);
      if (!Number.isFinite(productId) || productId < 1) {
        return res.status(400).json({ ok: false, error: "product_id inválido." });
      }
      if (!Number.isFinite(delta) || delta === 0) {
        return res.status(400).json({ ok: false, error: "delta debe ser un entero distinto de 0." });
      }
      const prod = await db.collection("products").findOne({ _id: productId });
      if (!prod) return res.status(404).json({ ok: false, error: "Producto no encontrado." });
      const prev = Math.max(0, parseInt(String(prod.stock ?? 0), 10) || 0);
      const next = Math.max(0, prev + delta);
      const applied = next - prev;
      if (applied === 0) {
        return res.status(400).json({ ok: false, error: "El ajuste no cambia el stock (ya en 0)." });
      }
      await db.collection("products").updateOne(
        { _id: productId },
        { $set: { stock: next, updatedAt: new Date() } }
      );
      await recordStockMovement(db, {
        product_id: productId,
        delta: applied,
        reason: "ajuste_manual",
        note,
        by: { id: admin.id, email: admin.email, name: admin.name },
        stock_after: next,
      });
      const product = await db.collection("products").findOne({ _id: productId });
      res.json({ ok: true, product: publicAdminProduct(product), delta: applied });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/admin/products", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const rows = await db.collection("products").find({}).sort({ _id: 1 }).toArray();
      res.json({
        ok: true,
        products: rows.map((p) => publicAdminProduct(p)),
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
      let stock = parseInt(String(req.body?.stock ?? "0"), 10);
      const stockAdd = parseInt(String(req.body?.stock_add ?? "0"), 10);
      if (Number.isFinite(stockAdd) && stockAdd > 0) {
        stock = (Number.isFinite(stock) && stock >= 0 ? stock : 0) + stockAdd;
      }
      const sales_channel = normalizeSalesChannel(req.body?.sales_channel);
      const pos = parseProductPosFields(req.body || {}, { partial: false });
      if (!name) return res.status(400).json({ ok: false, error: "Nombre obligatorio." });
      if (!Number.isFinite(price_cents) || price_cents < 0) return res.status(400).json({ ok: false, error: "Precio inválido (price_cents)." });
      if (compare_price_cents != null && (!Number.isFinite(compare_price_cents) || compare_price_cents < 0))
        return res.status(400).json({ ok: false, error: "Precio anterior inválido (compare_price_cents)." });

      let tagLabels = [];
      if (req.body?.tags_json != null && String(req.body.tags_json).trim() !== "") {
        try {
          const parsed = JSON.parse(String(req.body.tags_json));
          if (Array.isArray(parsed)) {
            tagLabels = parsed.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 30);
          }
        } catch {
          return res.status(400).json({ ok: false, error: "tags_json inválido." });
        }
      }
      for (const label of [pos.category, pos.subcategory]) {
        if (label && !tagLabels.includes(label)) tagLabels.push(String(label));
      }
      const tags = await ensureStoreTags(db, tagLabels);

      let image_urls = [];
      const files = Array.isArray(req.files) ? req.files : [];
      if (files.length > 0) {
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

      // Descuento POS: precio lista → compare; precio venta con dto
      let sellPrice = price_cents;
      let compareOut = compare_price_cents;
      const discount = Number(pos.discount_percent) || 0;
      if (discount > 0 && discount < 100 && compareOut == null) {
        compareOut = price_cents;
        sellPrice = Math.round((price_cents * (100 - discount)) / 100);
      }

      await db.collection("products").insertOne({
        _id: id,
        name,
        description,
        price_cents: sellPrice,
        compare_price_cents: compareOut != null ? compareOut : undefined,
        stock: Number.isFinite(stock) && stock >= 0 ? stock : 0,
        active: 1,
        image_url,
        image_urls,
        tags,
        sales_channel,
        ...pos,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const product = await db.collection("products").findOne({ _id: id });
      res.json({
        ok: true,
        product: publicAdminProduct(product),
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
      if (req.body?.sales_channel !== undefined) {
        $set.sales_channel = normalizeSalesChannel(req.body.sales_channel);
      }
      const posPatch = parseProductPosFields(req.body || {}, { partial: true });
      Object.assign($set, posPatch);
      if (req.body?.stock_add !== undefined) {
        const add = parseInt(String(req.body.stock_add), 10);
        if (Number.isFinite(add) && add !== 0) {
          const base = Number.isFinite(Number($set.stock)) ? Number($set.stock) : Number(prevRow.stock) || 0;
          $set.stock = Math.max(0, base + add);
        }
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
            $set.tags = await ensureStoreTags(
              db,
              parsed.map((x) => String(x || "").trim()).filter(Boolean)
            );
          } catch (e) {
            if (String(e?.message || "").includes("tags_json")) throw e;
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
      $set.updatedAt = new Date();
      const prevStock = Math.max(0, parseInt(String(prevRow.stock ?? 0), 10) || 0);
      await db.collection("products").updateOne({ _id: id }, { $set });
      const product = await db.collection("products").findOne({ _id: id });
      if (product && typeof $set.stock === "number") {
        const nextStock = Math.max(0, parseInt(String(product.stock ?? 0), 10) || 0);
        const delta = nextStock - prevStock;
        if (delta !== 0) {
          await recordStockMovement(db, {
            product_id: id,
            delta,
            reason: "edicion_producto",
            note: String(req.body?.stock_note || "").trim().slice(0, 300) || null,
            by: null,
            stock_after: nextStock,
          });
        }
      }
      res.json({
        ok: true,
        product: publicAdminProduct(product),
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

  // =========================
  // Pagos / Webpay (admin)
  // =========================
  app.get("/api/store/admin/payments", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const cfg = await readPaymentSettings(db);
      res.json({ ok: true, payments: publicPaymentSettingsView(cfg) });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.patch("/api/store/admin/payments", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const body = req.body || {};
      const mode = body.mode != null ? String(body.mode) : undefined;
      if (mode != null) {
        const m = mode.trim().toLowerCase();
        if (!["mock", "integration", "production", "integracion", "integración", "produccion", "producción"].includes(m)) {
          return res.status(400).json({ ok: false, error: "Modo inválido. Usa: mock, integration o production." });
        }
      }
      if (body.public_base_url != null && String(body.public_base_url).trim()) {
        const u = String(body.public_base_url).trim();
        if (!/^https?:\/\//i.test(u)) {
          return res.status(400).json({ ok: false, error: "URL pública debe empezar con http:// o https://" });
        }
      }
      try {
        const cfg = await savePaymentSettings(db, {
          mode: body.mode,
          commerce_code: body.commerce_code,
          api_key: body.api_key,
          public_base_url: body.public_base_url,
          tuu_enabled: body.tuu_enabled,
          tuu_mode: body.tuu_mode,
          tuu_account_id: body.tuu_account_id,
          tuu_secret: body.tuu_secret,
        });
        res.json({
          ok: true,
          payments: publicPaymentSettingsView(cfg),
          message: "Guardado. TUU actualizado.",
        });
      } catch (saveErr) {
        const status = Number(/** @type {any} */ (saveErr)?.status) || 500;
        if (status >= 400 && status < 500) {
          return res.status(status).json({
            ok: false,
            error: saveErr instanceof Error ? saveErr.message : "No se pudo guardar.",
          });
        }
        throw saveErr;
      }
    } catch (e) {
      handleErr(res, e);
    }
  });

  // =========================
  // Caja / POS (admin, navegador)
  // =========================
  app.get("/api/store/admin/pos/lookup", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      await expireReservations(db);
      const q = String(req.query?.q || "").trim();
      if (!q) return res.status(400).json({ ok: false, error: "Indica código de barras, ID o nombre." });

      const asId = parseInt(q, 10);
      let product = null;
      if (Number.isFinite(asId) && String(asId) === q) {
        product = await db.collection("products").findOne({ _id: asId, active: { $ne: 0 } });
      }
      if (!product) {
        product = await db.collection("products").findOne({ barcode: q, active: { $ne: 0 } });
      }
      if (!product) {
        const all = await db
          .collection("products")
          .find({ active: { $ne: 0 } })
          .limit(400)
          .toArray();
        const needle = q.toLowerCase();
        product = all.find((p) => String(p.name || "").toLowerCase().includes(needle)) || null;
      }
      if (!product) return res.status(404).json({ ok: false, error: "Producto no encontrado." });

      res.json({
        ok: true,
        product: publicAdminProduct(product),
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/admin/pos/sale", async (req, res) => {
    try {
      const admin = await requireAdmin(req);
      const db = await getDb();
      await expireReservations(db);

      const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!rawItems.length) return res.status(400).json({ ok: false, error: "Agrega al menos un producto." });

      /** @type {Array<{ product_id: number, name: string, price_cents: number, line_total_cents: number, quantity: number, cost_cents: number }>} */
      const lines = [];
      for (const it of rawItems) {
        const pid = parseInt(String(it.productId ?? it.product_id ?? 0), 10);
        const qty = parseInt(String(it.quantity ?? 0), 10);
        if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(qty) || qty < 1) {
          return res.status(400).json({ ok: false, error: "Ítem de venta inválido." });
        }
        const prod = await db.collection("products").findOne({ _id: pid, active: { $ne: 0 } });
        if (!prod) return res.status(404).json({ ok: false, error: `Producto #${pid} no encontrado.` });
        const stock = parseInt(String(prod.stock ?? 0), 10) || 0;
        if (stock < qty) {
          return res.status(409).json({
            ok: false,
            error: `Stock insuficiente para ${prod.name} (hay ${stock}).`,
          });
        }
        if (isEventProduct(prod) && prod.event_id) {
          const ev = await findEventById(db, prod.event_id);
          if (ev && eventHasStarted(ev)) {
            return res.status(409).json({ ok: false, error: `El evento “${prod.name}” ya comenzó.` });
          }
        }
        const pricing = effectiveLinePricing(prod, qty);
        lines.push({
          product_id: pid,
          name: prod.name,
          price_cents: pricing.unit_price_cents,
          line_total_cents: pricing.line_total_cents,
          list_price_cents: pricing.list_price_cents,
          discount_percent: pricing.discount_percent,
          promo_applied: pricing.promo_applied,
          cost_cents: Math.max(0, parseInt(String(prod.cost_cents ?? 0), 10) || 0),
          quantity: qty,
          event_id: parseInt(String(prod.event_id ?? 0), 10) || null,
          product_kind: isEventProduct(prod) ? "event" : "product",
        });
      }

      const tender = String(req.body?.tender || req.body?.payment_method || "cash").trim().toLowerCase();
      const tenderLabel = tender === "card" || tender === "tarjeta" ? "tarjeta" : "efectivo";
      const now = new Date();
      const touched = [];

      try {
        for (const line of lines) {
          const r = await db.collection("products").updateOne(
            { _id: line.product_id, stock: { $gte: line.quantity } },
            { $inc: { stock: -line.quantity }, $set: { updatedAt: now } }
          );
          if (!r?.modifiedCount) {
            throw Object.assign(new Error(`Stock insuficiente para ${line.name}.`), { code: "STOCK" });
          }
          touched.push(line);
        }

        const broken = await breakReservationsForProducts(
          db,
          lines.map((l) => l.product_id)
        );

        const orderId = await nextSeq(db, "order");
        const subtotal = lines.reduce((s, l) => s + l.line_total_cents, 0);

        for (const line of lines) {
          const fresh = await db.collection("products").findOne({ _id: line.product_id }, { projection: { stock: 1 } });
          await recordStockMovement(db, {
            product_id: line.product_id,
            delta: -line.quantity,
            reason: "venta_pos",
            order_id: orderId,
            by: { id: admin.id, email: admin.email, name: admin.name },
            stock_after: Math.max(0, parseInt(String(fresh?.stock ?? 0), 10) || 0),
          });
        }

        await db.collection("store_orders").insertOne({
          _id: orderId,
          user_id: admin.id,
          status: "paid",
          currency: "CLP",
          subtotal_cents: subtotal,
          shipping_fee_cents: 0,
          total_cents: subtotal,
          items: lines,
          fulfillment: {
            method: "pos",
            label: "Venta en tienda (caja)",
          },
          payment: {
            provider: "pos",
            tender: tenderLabel,
          },
          inventory_applied: true,
          inventory_applied_at: now,
          channel: "pos",
          event_cups_recorded: true,
          createdAt: now,
          updatedAt: now,
        });
        const posPaid = await db.collection("store_orders").findOne({ _id: orderId });
        await recordPaidEventCupsFromOrder(db, posPaid);

        let boleta = null;
        try {
          const posOrder = await db.collection("store_orders").findOne({ _id: orderId });
          boleta = await issueBoletaForOrder(db, posOrder);
        } catch {
          /* ignore */
        }

        res.json({
          ok: true,
          orderId,
          total_cents: subtotal,
          items: lines,
          boleta,
          reservations_broken: broken,
          message:
            broken > 0
              ? `Venta OK. Se liberaron ${broken} reserva(s) web por prioridad de tienda.`
              : "Venta registrada.",
        });
      } catch (e) {
        for (const t of touched) {
          try {
            await db.collection("products").updateOne(
              { _id: t.product_id },
              { $inc: { stock: t.quantity }, $set: { updatedAt: now } }
            );
          } catch {
            /* ignore */
          }
        }
        throw e;
      }
    } catch (e) {
      handleErr(res, e);
    }
  });

  mountAccountMailRoutes(app, {
    getDb,
    requireAdmin,
    requireUser,
    handleErr,
    resolvePublicBaseUrl,
  });

  mountDeckRoutes(app, { getDb, requireUser, handleErr });
}

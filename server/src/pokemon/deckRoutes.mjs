/**
 * Mazos del usuario (Pokémon + Mitos y Leyendas).
 * CRUD + parse Pokémon + búsqueda de cartas (pokemontcg.io).
 */
import { nextSeq } from "../counters.mjs";
import { clientKey, rateLimit } from "../rateLimit.mjs";
import { parseAndEnrichPokemonDecklist } from "./enrichCategories.mjs";
import { toStoredParsedCards } from "./deckParser.mjs";
import { searchPokemontcgCards } from "./pokemontcgSearch.mjs";
import { searchMylCards } from "../myl/mylSearch.mjs";

function normalizeDeckGame(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "mitos-y-leyendas" || s === "myl" || s === "mitos" || s.includes("mito")) {
    return "mitos-y-leyendas";
  }
  return "pokemon";
}

function serializeValidation(v) {
  if (!v || typeof v !== "object") {
    return { cardCount: 0, errorMessages: [], warnings: [] };
  }
  return {
    cardCount: Number(v.cardCount) || 0,
    errorMessages: Array.isArray(v.errorMessages) ? v.errorMessages.map(String) : [],
    warnings: Array.isArray(v.warnings) ? v.warnings.map(String) : [],
  };
}

function publicDeckSummary(d) {
  const validation = serializeValidation(d.validation);
  const game = normalizeDeckGame(d.game);
  return {
    id: d._id,
    name: d.name,
    game,
    cardCount: validation.cardCount,
    isValid: validation.errorMessages.length === 0,
    updatedAt: d.updatedAt || null,
  };
}

function publicDeckDetail(d) {
  return {
    id: d._id,
    name: d.name,
    game: normalizeDeckGame(d.game),
    rawText: d.rawText || "",
    validation: serializeValidation(d.validation),
    updatedAt: d.updatedAt || null,
    createdAt: d.createdAt || null,
  };
}

function buildMylDeckPayload(rawText) {
  const text = String(rawText || "").trim();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const errors = [];
  if (!text) errors.push("La lista no puede quedar vacía.");
  else if (lines.length < 1) errors.push("Pegá al menos una carta o línea de mazo.");
  return {
    rawText: text,
    parsedCards: [],
    validation: {
      cardCount: lines.length,
      errorMessages: errors,
      warnings: [],
    },
    parse: {
      isValid: errors.length === 0,
      cardCount: lines.length,
      errors,
      warnings: [],
      categories: { pokemon: 0, trainer: 0, energy: 0 },
    },
  };
}

async function buildPokemonDeckPayload(rawText, allowedMarks) {
  const parsed = await parseAndEnrichPokemonDecklist(rawText, {
    allowedRegulationMarks: allowedMarks,
  });
  return {
    rawText: String(rawText || "").trim(),
    parsedCards: toStoredParsedCards(parsed.cards),
    validation: {
      cardCount: parsed.cardCount,
      errorMessages: parsed.errors,
      warnings: parsed.warnings,
    },
    parse: {
      isValid: parsed.isValid,
      cardCount: parsed.cardCount,
      errors: parsed.errors,
      warnings: parsed.warnings,
      categories: {
        pokemon: parsed.categories.totals.pokemon,
        trainer: parsed.categories.totals.trainer,
        energy: parsed.categories.totals.energy,
      },
    },
  };
}

async function buildDeckPayload(game, rawText, allowedMarks) {
  if (game === "mitos-y-leyendas") return buildMylDeckPayload(rawText);
  return buildPokemonDeckPayload(rawText, allowedMarks);
}

/**
 * @param {import('express').Express} app
 * @param {{ getDb: () => Promise<any>, requireUser: (req: any) => Promise<any>, handleErr: (res: any, e: any) => void }} deps
 */
export function mountDeckRoutes(app, { getDb, requireUser, handleErr }) {
  app.get("/api/store/me/decks", async (req, res) => {
    try {
      const u = await requireUser(req);
      const db = await getDb();
      const decks = await db
        .collection("player_decks")
        .find({ user_id: u.id })
        .sort({ updatedAt: -1 })
        .toArray();
      let list = decks.map(publicDeckSummary);
      if (req.query.game) {
        const g = normalizeDeckGame(req.query.game);
        list = list.filter((d) => d.game === g);
      }
      res.json({ ok: true, decks: list });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/me/decks/:id", async (req, res) => {
    try {
      const u = await requireUser(req);
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: "Mazo inválido." });
      }
      const db = await getDb();
      const deck = await db.collection("player_decks").findOne({ _id: id, user_id: u.id });
      if (!deck) return res.status(404).json({ ok: false, error: "Mazo no encontrado." });
      res.json({ ok: true, deck: publicDeckDetail(deck) });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/me/decks", async (req, res) => {
    try {
      const u = await requireUser(req);
      const name = String(req.body?.name || "").trim();
      const rawText = String(req.body?.rawText || "").trim();
      const game = normalizeDeckGame(req.body?.game);
      if (!name || !rawText) {
        return res.status(400).json({ ok: false, error: "Nombre y lista son obligatorios." });
      }
      const payload = await buildDeckPayload(game, rawText);
      const db = await getDb();
      const id = await nextSeq(db, "player_deck");
      const now = new Date();
      const doc = {
        _id: id,
        user_id: u.id,
        game,
        name,
        rawText: payload.rawText,
        parsedCards: payload.parsedCards,
        validation: payload.validation,
        createdAt: now,
        updatedAt: now,
      };
      await db.collection("player_decks").insertOne(doc);
      res.status(201).json({ ok: true, deck: publicDeckDetail(doc) });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.patch("/api/store/me/decks/:id", async (req, res) => {
    try {
      const u = await requireUser(req);
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: "Mazo inválido." });
      }
      const db = await getDb();
      const deck = await db.collection("player_decks").findOne({ _id: id, user_id: u.id });
      if (!deck) return res.status(404).json({ ok: false, error: "Mazo no encontrado." });

      const patch = { updatedAt: new Date() };
      const name = req.body?.name != null ? String(req.body.name).trim() : "";
      if (name) patch.name = name;

      const game =
        req.body?.game != null ? normalizeDeckGame(req.body.game) : normalizeDeckGame(deck.game);
      if (req.body?.game != null) patch.game = game;

      if (req.body?.rawText != null) {
        const rawText = String(req.body.rawText || "").trim();
        if (!rawText) {
          return res.status(400).json({ ok: false, error: "La lista no puede quedar vacía." });
        }
        const payload = await buildDeckPayload(game, rawText);
        patch.rawText = payload.rawText;
        patch.parsedCards = payload.parsedCards;
        patch.validation = payload.validation;
      }

      await db.collection("player_decks").updateOne({ _id: id, user_id: u.id }, { $set: patch });
      const fresh = await db.collection("player_decks").findOne({ _id: id, user_id: u.id });
      res.json({ ok: true, deck: publicDeckDetail(fresh) });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.delete("/api/store/me/decks/:id", async (req, res) => {
    try {
      const u = await requireUser(req);
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: "Mazo inválido." });
      }
      const db = await getDb();
      const r = await db.collection("player_decks").deleteOne({ _id: id, user_id: u.id });
      if (!r.deletedCount) return res.status(404).json({ ok: false, error: "Mazo no encontrado." });
      res.json({ ok: true });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/decks/parse", async (req, res) => {
    try {
      const rawText = String(req.body?.rawText || "").trim();
      if (!rawText) {
        return res.status(400).json({ ok: false, error: "Pega una lista de mazo." });
      }
      const game = normalizeDeckGame(req.body?.game);
      const marks = Array.isArray(req.body?.allowedRegulationMarks)
        ? req.body.allowedRegulationMarks.map(String)
        : undefined;
      const payload = await buildDeckPayload(game, rawText, marks);
      res.json({ ok: true, ...payload.parse, rawText: payload.rawText, game });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/cards/search", async (req, res) => {
    try {
      const rl = rateLimit(clientKey(req, "cards-search"), { limit: 60, windowMs: 60_000 });
      if (!rl.ok) {
        return res.status(429).json({ ok: false, error: "Demasiadas búsquedas. Espera un momento." });
      }
      const q = String(req.query.q || "").trim();
      if (q.length < 1) return res.json({ ok: true, cards: [] });

      const typeRaw = String(req.query.type || "all");
      const type =
        typeRaw === "pokemon" || typeRaw === "trainer" || typeRaw === "energy" ? typeRaw : "all";
      const formatRaw = String(req.query.format || "standard");
      const format =
        formatRaw === "expanded" || formatRaw === "glc" ? formatRaw : "standard";

      const cards = await searchPokemontcgCards({ query: q, type, format });
      res.json({ ok: true, cards });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.get("/api/store/myl/cards/search", async (req, res) => {
    try {
      const rl = rateLimit(clientKey(req, "myl-cards-search"), { limit: 60, windowMs: 60_000 });
      if (!rl.ok) {
        return res.status(429).json({ ok: false, error: "Demasiadas búsquedas. Espera un momento." });
      }
      const q = String(req.query.q || "").trim();
      if (q.length < 2) return res.json({ ok: true, cards: [] });
      const type = String(req.query.type || "all").trim().toLowerCase() || "all";
      const cards = await searchMylCards({ query: q, type });
      res.json({ ok: true, cards });
    } catch (e) {
      handleErr(res, e);
    }
  });
}

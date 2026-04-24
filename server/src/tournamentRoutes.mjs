import path from "node:path";
import multer from "multer";
import { parseTdf } from "./tdfParse.mjs";
import { pokemonCardSearch } from "./pokeapi.mjs";

function deckRowKey(fileName, categoryCode, playId) {
  const cc = categoryCode !== "" && categoryCode != null ? String(categoryCode) : "_";
  return `${String(fileName)}|${cc}|${String(playId)}`;
}

function parseTournamentDateString(s) {
  if (!s || typeof s !== "string") return null;
  const trimmed = s.trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (m) {
    const month = parseInt(m[1], 10) - 1;
    const day = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    const d = new Date(year, month, day);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const t = Date.parse(trimmed);
  return Number.isFinite(t) ? new Date(t) : null;
}

function tournamentEffectiveYmd(payload, mtimeMs) {
  if (payload?.tournamentStartDate) {
    const d = parseTournamentDateString(String(payload.tournamentStartDate));
    if (d) return d.toISOString().slice(0, 10);
  }
  return new Date(mtimeMs).toISOString().slice(0, 10);
}

function buildSnapshotFromTdfText(text, base, mtimeMs) {
  const parsed = parseTdf(text, base);
  const hasFinished = !!(
    parsed.ok &&
    parsed.payload &&
    Array.isArray(parsed.payload.categories) &&
    parsed.payload.categories.some((c) => Array.isArray(c.standings) && c.standings.length > 0)
  );
  return {
    fileName: base,
    mtimeMs,
    parseError: parsed.ok ? null : parsed.error || "Error al parsear",
    payload: parsed.ok ? parsed.payload : null,
    hasFinishedStandings: hasFinished,
  };
}

function slimOverridesForTournaments(tournaments, full) {
  const out = {};
  for (const t of tournaments) {
    const payload = t.payload;
    if (!payload || !Array.isArray(payload.categories)) continue;
    for (const cat of payload.categories) {
      const rows = Array.isArray(cat.standings) ? cat.standings : [];
      const code = cat.categoryCode != null ? String(cat.categoryCode) : "";
      for (const row of rows) {
        const playId = row?.playId != null ? String(row.playId) : "";
        if (!playId) continue;
        const k = deckRowKey(t.fileName, code, playId);
        if (full[k]) out[k] = full[k];
      }
    }
  }
  return out;
}

const tdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if ((file.originalname || "").toLowerCase().endsWith(".tdf")) cb(null, true);
    else cb(new Error("Solo se aceptan archivos .tdf"));
  },
});

/**
 * @param {import('express').Express} app
 * @param {{ getDb: () => Promise<import('mongodb').Db> }} ctx
 */
export function mountTournamentRoutes(app, { getDb }) {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, standingsMode: "mongo-tdf-upload" });
  });

  app.post("/api/admin/upload-tdf", (req, res) => {
    tdfUpload.single("tdf")(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ ok: false, error: "Falta el archivo .tdf (campo del formulario: tdf)." });
      }
      try {
        const db = await getDb();
        const text = req.file.buffer.toString("utf8");
        const fileName = path.basename(req.file.originalname || "upload.tdf");
        const mtimeMs = Date.now();
        const snap = buildSnapshotFromTdfText(text, fileName, mtimeMs);
        const effectiveDate = tournamentEffectiveYmd(snap.payload, snap.mtimeMs);
        await db.collection("standings_snapshots").replaceOne(
          { fileName: snap.fileName },
          {
            fileName: snap.fileName,
            mtimeMs: snap.mtimeMs,
            parseError: snap.parseError,
            payload: snap.payload,
            hasFinishedStandings: snap.hasFinishedStandings,
            effectiveDate,
            updatedAt: new Date(),
          },
          { upsert: true }
        );
        await db.collection("standings_pending").updateOne(
          { _id: 1 },
          {
            $set: {
              fileName: snap.fileName,
              mtimeMs: snap.mtimeMs,
              payload: snap.payload,
              parseError: snap.parseError,
            },
          },
          { upsert: true }
        );
        const hasFinishedStandings = snap.hasFinishedStandings;
        return res.json({
          ok: !snap.parseError,
          pending: {
            fileName: snap.fileName,
            mtimeMs: snap.mtimeMs,
            payload: snap.payload,
            parseError: snap.parseError,
            hasFinishedStandings,
          },
        });
      } catch (e) {
        return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    });
  });

  app.get("/api/pending", async (_req, res) => {
    try {
      const db = await getDb();
      const doc = await db.collection("standings_pending").findOne({ _id: 1 });
      if (!doc?.fileName) {
        return res.json({
          ok: true,
          pending: { fileName: "", mtimeMs: 0, payload: null, parseError: null, hasFinishedStandings: false },
        });
      }
      const hasFinishedStandings = !!(
        doc.payload &&
        Array.isArray(doc.payload.categories) &&
        doc.payload.categories.some((c) => Array.isArray(c?.standings) && c.standings.length > 0)
      );
      return res.json({
        ok: !doc.parseError,
        pending: {
          fileName: doc.fileName,
          mtimeMs: doc.mtimeMs,
          payload: doc.payload,
          parseError: doc.parseError,
          hasFinishedStandings,
        },
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/public/tournaments/recent", async (req, res) => {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "5"), 10) || 5));
      const from = typeof req.query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from.trim()) ? req.query.from.trim() : null;
      const to = typeof req.query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to.trim()) ? req.query.to.trim() : null;

      const db = await getDb();
      const match = {};
      if (from) match.effectiveDate = { $gte: from };
      if (to) match.effectiveDate = { ...(match.effectiveDate || {}), $lte: to };

      const rows = await db
        .collection("standings_snapshots")
        .find(match)
        .sort({ effectiveDate: -1, mtimeMs: -1 })
        .limit(150)
        .toArray();

      const tournaments = rows.slice(0, limit).map((r) => ({
        fileName: r.fileName,
        mtimeMs: r.mtimeMs,
        parseError: r.parseError ?? null,
        payload: r.payload ?? null,
        hasFinishedStandings: Boolean(r.hasFinishedStandings),
      }));

      const keys = new Set();
      for (const t of tournaments) {
        const cats = t.payload?.categories;
        if (!Array.isArray(cats)) continue;
        for (const c of cats) {
          const code = c?.categoryCode != null ? String(c.categoryCode) : "";
          const standings = Array.isArray(c?.standings) ? c.standings : [];
          for (const row of standings) {
            const playId = row?.playId != null ? String(row.playId) : "";
            if (!playId) continue;
            keys.add(deckRowKey(t.fileName, code, playId));
          }
        }
      }

      let overrides = {};
      if (keys.size > 0) {
        const ovs = await db
          .collection("tournament_deck_overrides")
          .find({ k: { $in: Array.from(keys).slice(0, 5000) } })
          .project({ _id: 0, k: 1, entry: 1 })
          .toArray();
        overrides = Object.fromEntries(ovs.map((r) => [r.k, r.entry]));
      }

      const slim = slimOverridesForTournaments(tournaments, overrides);
      res.json({ ok: true, tournaments, overrides: slim });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/public/pokemon-card-search", async (req, res) => {
    try {
      const data = await pokemonCardSearch(req.query.q);
      res.json(data);
    } catch (e) {
      res.status(502).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}

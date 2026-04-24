import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { XMLParser } from "fast-xml-parser";
import { mountStoreAndSession } from "./store-routes.mjs";
import { readDeckOverrides, slimOverridesForTournaments } from "./tournament-overrides.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const UI_DIR = path.join(ROOT, "preview-standings");
const STORE_DIST = path.join(ROOT, "trejotienda", "dist");

const PORT = Number(process.env.PORT) || 3847;

const tdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if ((file.originalname || "").toLowerCase().endsWith(".tdf")) cb(null, true);
    else cb(new Error("Solo se aceptan archivos .tdf"));
  },
});

const CATEGORY_LABEL = {
  "0": "Categoría Junior",
  "1": "Categoría Senior",
  "2": "Categoría Máster",
};

/** Lista completa de entradas `pokemon` (incluye formas y megas). */
const POKEAPI_POKEMON_LIST_URL = "https://pokeapi.co/api/v2/pokemon?limit=1350";

/** Lista global de Pokémon desde PokeAPI; se carga una vez. */
let pokeapiPokemonListPromise = null;

function getPokeapiPokemonList() {
  if (!pokeapiPokemonListPromise) {
    pokeapiPokemonListPromise = (async () => {
      const r = await fetch(POKEAPI_POKEMON_LIST_URL, {
        headers: { "User-Agent": "PlasmaStore-tom-bridge/1.0" },
      });
      if (!r.ok) throw new Error(`PokeAPI (lista pokemon) respondió ${r.status}`);
      const j = await r.json();
      /** @type {{ id: number; name: string }[]} */
      const out = [];
      for (const row of j.results || []) {
        const m = String(row.url || "").match(/\/(\d+)\/?$/);
        const id = m ? parseInt(m[1], 10) : 0;
        if (id) out.push({ id, name: String(row.name || "") });
      }
      return out;
    })();
  }
  return pokeapiPokemonListPromise;
}

const SPRITE_VERSIONS_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions";

/** Respaldo si falla la petición a `pokemon/{id}` (icono caja Gen VIII). */
function menuIconUrlHeuristic(id) {
  return `${SPRITE_VERSIONS_BASE}/generation-viii/icons/${id}.png`;
}

/** Cache: id recurso PokeAPI → URL de icono menú/caja (party/box). */
const pokemonDeckMenuIconUrlById = new Map();

/**
 * Iconos de menú/caja del juego (SV → Espada/Escudo → Gen VII), según `pokemon/{id}` — mismo estilo que PC/equipo.
 */
async function resolvePokemonDeckDisplayUrl(id) {
  const k = String(id);
  if (pokemonDeckMenuIconUrlById.has(k)) return pokemonDeckMenuIconUrlById.get(k);
  let url = menuIconUrlHeuristic(id);
  try {
    const r = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}/`, {
      headers: { "User-Agent": "PlasmaStore-tom-bridge/1.0" },
    });
    if (r.ok) {
      const p = await r.json();
      url =
        p?.sprites?.versions?.["generation-ix"]?.["scarlet-violet"]?.front_default ||
        p?.sprites?.versions?.["generation-viii"]?.icons?.front_default ||
        p?.sprites?.versions?.["generation-vii"]?.icons?.front_default ||
        url;
    }
  } catch {
    /* url heurística */
  }
  pokemonDeckMenuIconUrlById.set(k, url);
  return url;
}

async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    for (;;) {
      const j = i;
      i += 1;
      if (j >= items.length) return;
      out[j] = await fn(items[j], j);
    }
  }
  const n = Math.min(limit, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function buildPlayerMap(root) {
  const players = asArray(root?.players?.player);
  /** @type {Map<string, { firstname: string; lastname: string }>} */
  const map = new Map();
  for (const p of players) {
    const id = p["@_userid"] ?? p["@_user"] ?? p.userid;
    const uid = id != null ? String(id) : null;
    if (!uid) continue;
    map.set(uid, {
      firstname: String(p.firstname ?? ""),
      lastname: String(p.lastname ?? ""),
    });
  }
  return map;
}

/**
 * @param {string} xmlText
 * @param {string} fileName
 */
function parseTdf(xmlText, fileName) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  let root;
  try {
    root = parser.parse(xmlText).tournament;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      payload: null,
    };
  }

  if (!root) {
    return { ok: false, error: "XML sin nodo raíz tournament", payload: null };
  }

  const tournamentName = String(root.data?.name ?? "").trim();
  const tournamentStartDate = String(root.data?.startdate ?? "").trim();
  const fileFormatVersion = root["@_version"] != null ? String(root["@_version"]) : "";
  const playerMap = buildPlayerMap(root);

  const pods = asArray(root.standings?.pod);
  const warnings = [];

  const categories = [];
  for (const pod of pods) {
    const type = pod["@_type"] != null ? String(pod["@_type"]) : "";
    if (type !== "finished") continue;

    const catCode = pod["@_category"] != null ? String(pod["@_category"]) : "";
    const plist = asArray(pod.player)
      .map((row) => ({
        id: row["@_id"] != null ? String(row["@_id"]) : "",
        place: row["@_place"] != null ? parseInt(String(row["@_place"]), 10) : NaN,
      }))
      .filter((r) => r.id && Number.isFinite(r.place));

    if (plist.length === 0) continue;

    plist.sort((a, b) => a.place - b.place);
    const standings = plist.map((row) => {
      const info = playerMap.get(row.id) || { firstname: "", lastname: "" };
      const name = `${info.firstname} ${info.lastname}`.trim() || row.id;
      return {
        place: row.place,
        name,
        playId: row.id,
      };
    });
    const top4 = standings.slice(0, 4).map((row) => ({
      Clasificación: String(row.place),
      Nombre: row.name,
      "Play! ID": row.playId,
    }));

    const division = CATEGORY_LABEL[catCode] || `Categoría (${catCode || "?"})`;

    categories.push({
      division,
      categoryCode: catCode,
      headers: ["Clasificación", "Nombre", "Play! ID"],
      rows: top4,
      standings,
    });
  }

  if (categories.length === 0) {
    warnings.push(
      "No hay standings “finished” con jugadores en el .tdf (torneo sin cerrar o archivo intermedio)."
    );
  }

  let roundCount = 0;
  const podNode = root.pods?.pod;
  const firstPod = Array.isArray(podNode) ? podNode[0] : podNode;
  if (firstPod?.rounds?.round != null) {
    roundCount = asArray(firstPod.rounds.round).length;
  }

  const payload = {
    source: "tdf",
    sourceFile: fileName,
    tournamentName,
    tournamentStartDate,
    fileFormatVersion,
    roundCurrent: roundCount || null,
    roundTotal: roundCount || null,
    roundLabel: roundCount ? `Rondas en archivo: ${roundCount}` : "",
    generatedAt: "",
    categories: categories.map((c) => ({
      division: c.division,
      categoryCode: c.categoryCode,
      top4: c.rows,
      standings: c.standings,
    })),
    warnings: [...warnings],
  };

  return { ok: true, error: null, payload };
}

/** @type {{ mtimeMs: number; fileName: string; payload: object | null; parseError: string | null }} */
let pending = {
  mtimeMs: 0,
  fileName: "",
  payload: null,
  parseError: null,
};

/** Último torneo publicado desde el panel admin (solo memoria; se pierde al reiniciar el servidor). */
let lastPublished = null;

/** Snapshots de cada .tdf subido manualmente (más reciente primero). Solo memoria. */
/** @type {{ fileName: string; mtimeMs: number; parseError: string | null; payload: object | null; hasFinishedStandings: boolean }[]} */
let recentSnapshots = [];

/**
 * @param {string | undefined} s
 */
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

/**
 * @param {object | null} payload
 * @param {number} mtimeMs
 */
function tournamentEffectiveDate(payload, mtimeMs) {
  if (payload?.tournamentStartDate) {
    const d = parseTournamentDateString(String(payload.tournamentStartDate));
    if (d) return d;
  }
  return new Date(mtimeMs);
}

/**
 * @param {string} text
 * @param {string} base
 * @param {number} mtimeMs
 */
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

/**
 * @param {string} text
 * @param {string} fileName
 */
function applyTdfUpload(text, fileName) {
  const base = path.basename(fileName || "upload.tdf");
  const mtimeMs = Date.now();
  const snap = buildSnapshotFromTdfText(text, base, mtimeMs);
  pending = {
    mtimeMs: snap.mtimeMs,
    fileName: snap.fileName,
    payload: snap.payload,
    parseError: snap.parseError,
  };
  recentSnapshots = recentSnapshots.filter((s) => s.fileName !== snap.fileName);
  recentSnapshots.unshift(snap);
  if (recentSnapshots.length > 200) recentSnapshots.length = 200;
  return snap;
}

function main() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  mountStoreAndSession(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, standingsMode: "manual-tdf-upload" });
  });

  app.post("/api/admin/upload-tdf", (req, res) => {
    tdfUpload.single("tdf")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ ok: false, error: "Falta el archivo .tdf (campo del formulario: tdf)." });
      }
      try {
        const text = req.file.buffer.toString("utf8");
        const fileName = path.basename(req.file.originalname || "upload.tdf");
        applyTdfUpload(text, fileName);
        const hasFinishedStandings = !!(
          pending.payload &&
          Array.isArray(pending.payload.categories) &&
          pending.payload.categories.some((c) => Array.isArray(c.standings) && c.standings.length > 0)
        );
        return res.json({
          ok: !pending.parseError,
          pending: {
            fileName: pending.fileName,
            mtimeMs: pending.mtimeMs,
            payload: pending.payload,
            parseError: pending.parseError,
            hasFinishedStandings,
          },
        });
      } catch (e) {
        return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    });
  });

  app.get("/api/pending", (_req, res) => {
    const hasFinishedStandings = !!(
      pending.payload &&
      Array.isArray(pending.payload.categories) &&
      pending.payload.categories.some((c) => Array.isArray(c.standings) && c.standings.length > 0)
    );
    const ok = !pending.fileName || !pending.parseError;
    res.json({
      ok,
      pending: {
        fileName: pending.fileName,
        mtimeMs: pending.mtimeMs,
        payload: pending.payload,
        parseError: pending.parseError,
        hasFinishedStandings,
      },
    });
  });

  app.get("/api/public/tournaments/recent", (req, res) => {
    const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit || "5"), 10) || 5));
    const fromStr = req.query.from != null ? String(req.query.from) : "";
    const toStr = req.query.to != null ? String(req.query.to) : "";
    let fromT = fromStr ? Date.parse(fromStr) : NaN;
    let toT = toStr ? Date.parse(toStr) : NaN;
    if (!Number.isFinite(fromT)) fromT = null;
    if (!Number.isFinite(toT)) toT = null;
    if (toT != null) toT = toT + 86400000 - 1;

    const matches = [];
    let scanned = 0;
    const maxScan = 150;
    for (const snap of recentSnapshots) {
      if (scanned >= maxScan) break;
      scanned += 1;
      const eff = snap.payload ? tournamentEffectiveDate(snap.payload, snap.mtimeMs) : new Date(snap.mtimeMs);
      const effMs = eff.getTime();
      if (fromT != null && effMs < fromT) continue;
      if (toT != null && effMs > toT) continue;
      matches.push(snap);
      if (matches.length >= limit) break;
    }
    try {
      const allOverrides = readDeckOverrides();
      const overrides = slimOverridesForTournaments(matches, allOverrides);
      res.json({ ok: true, tournaments: matches, overrides });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/public/pokemon-card-search", async (req, res) => {
    const raw = String(req.query.q || "")
      .trim()
      .slice(0, 80)
      .toLowerCase();
    if (raw.length < 1) {
      return res.json({ ok: true, source: "pokeapi/pokemon", cards: [] });
    }
    const tokens = raw.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return res.json({ ok: true, source: "pokeapi/pokemon", cards: [] });
    }
    try {
      const all = await getPokeapiPokemonList();
      /** @type {{ id: number; name: string }[]} */
      const hits = [];
      for (const p of all) {
        const n = p.name.toLowerCase();
        if (tokens.every((t) => n.includes(t))) hits.push(p);
      }
      const t0 = tokens[0];
      hits.sort((a, b) => {
        const na = a.name.toLowerCase();
        const nb = b.name.toLowerCase();
        const aStarts = na.startsWith(t0) ? 0 : 1;
        const bStarts = nb.startsWith(t0) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        if (a.name.length !== b.name.length) return a.name.length - b.name.length;
        return na.localeCompare(nb);
      });
      const max = 60;
      const slice = hits.slice(0, max);
      const partySpriteUrls = await mapWithConcurrency(slice, 8, (p) => resolvePokemonDeckDisplayUrl(p.id));
      const cards = slice.map((p, idx) => {
        const partySpriteUrl = partySpriteUrls[idx];
        const displayName = p.name.replace(/-/g, " ");
        return {
          id: String(p.id),
          name: p.name,
          displayName,
          setId: `#${p.id}`,
          number: "",
          setName: "Pokémon",
          imageSmall: partySpriteUrl,
          partySpriteUrl,
        };
      });
      res.json({
        ok: true,
        source: "pokeapi.co/api/v2/pokemon",
        cards,
      });
    } catch (e) {
      res.status(502).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/public/results", (_req, res) => {
    res.json({ ok: true, hasData: !!lastPublished, data: lastPublished });
  });

  app.post("/api/publish", (req, res) => {
    const b = req.body;
    if (!b || typeof b !== "object") {
      return res.status(400).json({ ok: false, error: "Cuerpo JSON vacío o inválido." });
    }
    if (!Array.isArray(b.categories) || b.categories.length === 0) {
      return res.status(400).json({ ok: false, error: "Faltan categories con el top publicado." });
    }
    const publishedAt = typeof b.publishedAt === "string" ? b.publishedAt : new Date().toISOString();
    const { dryRun: _dry, ...rest } = b;
    lastPublished = { ...rest, publishedAt };
    return res.json({ ok: true, stored: lastPublished });
  });

  app.use(express.static(UI_DIR));

  if (fs.existsSync(path.join(STORE_DIST, "index.html"))) {
    app.use("/tienda", express.static(STORE_DIST));
    app.get(/^\/tienda(\/.*)?$/, (req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      res.sendFile(path.join(STORE_DIST, "index.html"));
    });
  } else {
    console.warn("[tom-bridge] Plasma Store: ejecuta `npm run build` en la carpeta /trejotienda para servir /tienda/");
  }

  app.listen(PORT, () => {
    console.log(
      `[tom-bridge] Torneos: http://localhost:${PORT}/  | Tienda: http://localhost:${PORT}/tienda/`
    );
    console.log(
      "[tom-bridge] Standings: sube .tdf manualmente (panel admin o POST /api/admin/upload-tdf); no hay carpeta TOM ni watcher."
    );
    console.log(
      "[tom-bridge] Tras actualizar el código, reinicia este proceso; si el panel admin no lista productos suele ser servidor antiguo en el mismo puerto."
    );
  });
}

main();

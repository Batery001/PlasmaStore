import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import chokidar from "chokidar";
import { XMLParser } from "fast-xml-parser";
import { mountStoreAndSession } from "./store-routes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const UI_DIR = path.join(ROOT, "preview-standings");
const STORE_DIST = path.join(ROOT, "trejotienda", "dist");

const PORT = Number(process.env.PORT) || 3847;
const TOM_DATA =
  process.env.TOM_DATA || path.join(process.env.USERPROFILE || "", "TOM_DATA");

const CATEGORY_LABEL = {
  "0": "Categoría Junior",
  "1": "Categoría Senior",
  "2": "Categoría Máster",
};

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
  const tomVersion = root["@_version"] != null ? String(root["@_version"]) : "";
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
    const top4 = plist.slice(0, 4).map((row) => {
      const info = playerMap.get(row.id) || { firstname: "", lastname: "" };
      const name = `${info.firstname} ${info.lastname}`.trim() || row.id;
      return {
        Clasificación: String(row.place),
        Nombre: name,
        "Play! ID": row.id,
      };
    });

    const division = CATEGORY_LABEL[catCode] || `Categoría (${catCode || "?"})`;

    categories.push({
      division,
      categoryCode: catCode,
      headers: ["Clasificación", "Nombre", "Play! ID"],
      rows: top4,
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
    tomVersion,
    roundCurrent: roundCount || null,
    roundTotal: roundCount || null,
    roundLabel: roundCount ? `Rondas en archivo: ${roundCount}` : "",
    generatedAt: "",
    categories: categories.map((c) => ({
      division: c.division,
      categoryCode: c.categoryCode,
      top4: c.rows,
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

function listRootTdfFiles() {
  if (!fs.existsSync(TOM_DATA)) return [];
  /** @type {{ abs: string; base: string; mtimeMs: number }[]} */
  const out = [];
  for (const n of fs.readdirSync(TOM_DATA)) {
    if (!n.toLowerCase().endsWith(".tdf")) continue;
    const abs = path.join(TOM_DATA, n);
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    out.push({ abs, base: n, mtimeMs: Math.floor(st.mtimeMs) });
  }
  return out;
}

/**
 * Lee un .tdf concreto y actualiza `pending`.
 * @param {string} absPath
 */
function ingestFile(absPath) {
  const base = path.basename(absPath);
  if (!base.toLowerCase().endsWith(".tdf")) return;
  const parentDir = path.dirname(absPath);
  const isRootTdf = path.resolve(parentDir) === path.resolve(TOM_DATA);
  if (!isRootTdf) return;

  let text;
  try {
    text = fs.readFileSync(absPath, "utf8");
  } catch (e) {
    pending = {
      mtimeMs: Date.now(),
      fileName: base,
      payload: null,
      parseError: e instanceof Error ? e.message : String(e),
    };
    return;
  }

  const st = fs.statSync(absPath);
  const parsed = parseTdf(text, base);
  pending = {
    mtimeMs: Math.floor(st.mtimeMs),
    fileName: base,
    payload: parsed.ok ? parsed.payload : null,
    parseError: parsed.ok ? null : parsed.error || "Error al parsear",
  };
}

/**
 * Siempre usa el .tdf más reciente (mtime) en la raíz de TOM_DATA.
 * Así un torneo nuevo (p. ej. testupp.tdf) no queda oculto detrás de uno viejo (test.tdf).
 */
function syncPendingFromNewestRootTdf() {
  const files = listRootTdfFiles();
  if (files.length === 0) {
    pending = {
      mtimeMs: 0,
      fileName: "",
      payload: null,
      parseError: "No hay archivos .tdf en la raíz de TOM_DATA.",
    };
    return;
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  ingestFile(files[0].abs);
}

function main() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  mountStoreAndSession(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, tomData: TOM_DATA });
  });

  app.get("/api/pending", (_req, res) => {
    syncPendingFromNewestRootTdf();
    const hasFinishedStandings = !!(
      pending.payload &&
      Array.isArray(pending.payload.categories) &&
      pending.payload.categories.length > 0
    );
    res.json({
      ok: !pending.parseError,
      pending: {
        fileName: pending.fileName,
        mtimeMs: pending.mtimeMs,
        payload: pending.payload,
        parseError: pending.parseError,
        hasFinishedStandings,
      },
    });
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
    console.warn("[tom-bridge] Trejotienda: ejecuta `npm run build` en la carpeta /trejotienda para servir /tienda/");
  }

  const watcher = chokidar.watch(path.join(TOM_DATA, "*.tdf"), {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
  });

  let debounce = null;
  const scheduleRescan = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      syncPendingFromNewestRootTdf();
    }, 400);
  };

  watcher.on("add", scheduleRescan);
  watcher.on("change", scheduleRescan);

  app.listen(PORT, () => {
    if (!fs.existsSync(TOM_DATA)) {
      console.warn("[tom-bridge] Carpeta TOM_DATA no existe:", TOM_DATA);
      console.warn("[tom-bridge] Define TOM_DATA con la ruta correcta.");
    } else {
      syncPendingFromNewestRootTdf();
    }
    console.log(
      `[tom-bridge] Torneos: http://localhost:${PORT}/  | Tienda: http://localhost:${PORT}/tienda/`
    );
    console.log(`[tom-bridge] Vigilando .tdf en raíz de: ${TOM_DATA}`);
  });
}

main();

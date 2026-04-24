import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OVERRIDES_PATH = path.join(__dirname, "..", "data", "tournament-deck-overrides.json");

/**
 * @param {string} fileName
 * @param {string} categoryCode
 * @param {string} playId
 */
export function deckRowKey(fileName, categoryCode, playId) {
  const cc = categoryCode != null && String(categoryCode) !== "" ? String(categoryCode) : "_";
  return `${String(fileName)}|${cc}|${String(playId)}`;
}

/** @returns {Record<string, { sprites?: string[]; countryCode?: string; listUrl?: string }>} */
export function readDeckOverrides() {
  try {
    const raw = fs.readFileSync(OVERRIDES_PATH, "utf8");
    const j = JSON.parse(raw);
    if (j && typeof j === "object" && j.overrides && typeof j.overrides === "object") {
      return j.overrides;
    }
  } catch {
    /* sin archivo o JSON inválido */
  }
  return {};
}

/** @param {Record<string, { sprites?: string[]; countryCode?: string; listUrl?: string }>} overrides */
export function writeDeckOverrides(overrides) {
  fs.mkdirSync(path.dirname(OVERRIDES_PATH), { recursive: true });
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify({ version: 1, overrides }, null, 2), "utf8");
}

/**
 * Devuelve solo las claves que aparecen en los torneos listados (menos peso en red).
 * @param {Array<{ fileName: string; payload: object | null }>} tournaments
 * @param {Record<string, unknown>} full
 */
export function slimOverridesForTournaments(tournaments, full) {
  /** @type {Record<string, unknown>} */
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

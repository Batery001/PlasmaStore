import { normalizeEventGameTag } from "./eventGameTags.mjs";

function bad(msg) {
  return Object.assign(new Error(msg), { status: 400 });
}

export function normalizePopid(raw, { required = false } = {}) {
  const popid = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!popid) {
    if (required) throw bad("Indica un POPID válido (letras, números o guion).");
    return "";
  }
  if (!/^[A-Z0-9-]{4,32}$/.test(popid)) {
    throw bad("Indica un POPID válido (letras, números o guion).");
  }
  return popid;
}

export function normalizeMylCl(raw, { required = false } = {}) {
  const cl = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!cl) {
    if (required) throw bad("Indica tu CL (código de jugador).");
    return "";
  }
  if (!/^[A-Z0-9-]{2,32}$/.test(cl)) {
    throw bad("Indica tu CL (código de jugador).");
  }
  return cl;
}

export function splitPlayerFullName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0].slice(0, 80), last_name: "" };
  return { first_name: parts[0].slice(0, 80), last_name: parts.slice(1).join(" ").slice(0, 80) };
}

/**
 * Completa solo campos vacíos del perfil con el formulario de jugador.
 * @param {any} user
 * @param {any} player
 */
export function missingUserFieldsFromPlayer(user, player) {
  const patch = {};
  if (!user || !player || typeof player !== "object") return patch;
  if (player.popid && !String(user.popid || "").trim()) patch.popid = player.popid;
  if (player.cl && !String(user.myl_cl || "").trim()) patch.myl_cl = player.cl;
  if (player.birth_year && (user.birth_year == null || user.birth_year === "")) {
    patch.birth_year = player.birth_year;
  }
  const hasFirst = String(user.first_name || "").trim();
  const hasLast = String(user.last_name || "").trim();
  if (!hasFirst || !hasLast) {
    const names = splitPlayerFullName(player.full_name);
    if (!hasFirst && names.first_name) patch.first_name = names.first_name;
    if (!hasLast && names.last_name) patch.last_name = names.last_name;
    if (patch.first_name || patch.last_name) {
      const fn = patch.first_name || hasFirst;
      const ln = patch.last_name || hasLast;
      patch.name = `${fn} ${ln}`.trim() || user.name;
    }
  }
  return patch;
}

/**
 * Datos de jugador según etiqueta del torneo.
 * @param {string} gameTag
 * @param {any} raw
 */
export function parseEventPlayer(gameTag, raw) {
  const tag = normalizeEventGameTag(gameTag);
  const src = raw && typeof raw === "object" ? raw : {};
  if (tag === "pokemon") {
    const popid = normalizePopid(src.popid || src.pop_id || src.popId, { required: true });
    const full_name = String(src.full_name || src.fullName || src.name || "").trim().slice(0, 120);
    const birth_year = parseInt(String(src.birth_year ?? src.birthYear ?? ""), 10);
    const yearNow = new Date().getFullYear();
    if (full_name.length < 3) throw bad("Indica el nombre completo del jugador.");
    if (!Number.isFinite(birth_year) || birth_year < 1900 || birth_year > yearNow) {
      throw bad("Indica un año de nacimiento válido.");
    }
    return { game_tag: "pokemon", popid, full_name, birth_year };
  }
  if (tag === "mitos-y-leyendas") {
    const full_name = String(src.full_name || src.fullName || src.name || "").trim().slice(0, 120);
    const cl = normalizeMylCl(src.cl || src.codigo_cl || src.myl_cl, { required: true });
    if (full_name.length < 3) throw bad("Indica el nombre del jugador.");
    const race = String(src.myl_race || src.race || src.raza || "").trim();
    return { game_tag: "mitos-y-leyendas", full_name, cl, myl_race: race };
  }
  return null;
}

export function eventNeedsPlayerForm(gameTag) {
  const tag = normalizeEventGameTag(gameTag);
  return tag === "pokemon" || tag === "mitos-y-leyendas";
}

export function parseDecklist(raw, { required = false } = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const url = String(src.decklist_url || src.list_url || "").trim().slice(0, 500);
  const text = String(src.decklist_text || src.decklist || "").trim().slice(0, 20000);
  if (url) {
    if (!/^https?:\/\//i.test(url)) throw bad("Indica una URL válida de la lista (Poképaste o similar).");
    return { decklist_url: url, decklist_text: text };
  }
  if (text.length >= 20) return { decklist_url: "", decklist_text: text };
  if (required) throw bad("Pega tu lista de mazo o una URL (Poképaste / Limitless). En Casual no se pide lista.");
  return { decklist_url: "", decklist_text: "" };
}

export function parseGuardian(raw, { required = false } = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const guardian_name = String(src.guardian_name || src.tutor_name || "").trim().slice(0, 120);
  const guardian_rut = String(src.guardian_rut || src.tutor_rut || "").trim().slice(0, 20);
  if (required && guardian_name.length < 3) {
    throw bad("Si el jugador es menor de 18 años, indica el nombre del tutor o apoderado.");
  }
  if (required && guardian_rut.length < 7) {
    throw bad("Si el jugador es menor de 18 años, indica el RUT del tutor o apoderado.");
  }
  return { guardian_name, guardian_rut };
}

export function playerSnapshotFromReg(row, gameTag) {
  const p = row?.event_player && typeof row.event_player === "object" ? row.event_player : {};
  const tag = normalizeEventGameTag(gameTag || p.game_tag);
  return {
    game_tag: tag || p.game_tag || "",
    popid: row?.popid || p.popid || "",
    cl: row?.cl || p.cl || "",
    full_name: row?.player_name || p.full_name || "",
    birth_year: row?.birth_year || p.birth_year || null,
    decklist_text: row?.decklist_text || p.decklist_text || "",
    decklist_url: row?.decklist_url || p.decklist_url || "",
    guardian_name: row?.guardian_name || p.guardian_name || "",
    guardian_rut: row?.guardian_rut || p.guardian_rut || "",
    myl_race: row?.myl_race || p.myl_race || "",
  };
}

export function eventPlayerFormComplete(gameTag, player) {
  if (!eventNeedsPlayerForm(gameTag)) return true;
  const tag = normalizeEventGameTag(gameTag);
  const p = player && typeof player === "object" ? player : {};
  if (tag === "pokemon") return Boolean(p.popid);
  if (tag === "mitos-y-leyendas") return Boolean(p.cl) && Boolean(p.myl_race);
  return true;
}

export function formatEventPlayerSummary(player) {
  if (!player || typeof player !== "object") return "";
  if (player.game_tag === "pokemon" || player.popid) {
    return `${player.full_name || "Jugador"} · POPID ${player.popid || "—"}${
      player.birth_year ? ` · ${player.birth_year}` : ""
    }`;
  }
  if (player.game_tag === "mitos-y-leyendas" || player.cl) {
    return `${player.full_name || "Jugador"} · CL ${player.cl || "—"}${
      player.myl_race ? ` · ${player.myl_race}` : ""
    }`;
  }
  return String(player.full_name || "").trim();
}

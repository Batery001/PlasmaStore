import type { MylCardSearchResult, MylCardType } from "./myl-search";

/** Reglas JO / FAQ Castillo (Primer Bloque y equivalentes). */
export const MYL_DECK_SIZE = 50;
export const MYL_MAX_COPIES = 3;
/** Mínimo de Aliados en mazos Racial / Racial soporte libre. */
export const MYL_MIN_ALLIES_RACIAL = 16;

export type MylTypeFilter = "all" | MylCardType;

export type MylDeckConstruction = "racial" | "soporte-libre" | "libre";

export type MylDeckSlot = {
  key: string;
  name: string;
  type: string;
  typeLabel: string;
  qty: number;
  editionId?: string;
  editionSlug?: string;
  edid?: string;
  image?: string;
};

const TYPE_LABELS: Record<string, string> = {
  aliado: "Aliado",
  talisman: "Talismán",
  arma: "Arma",
  totem: "Tótem",
  oro: "Oro",
  monumento: "Monumento",
  otro: "Otro",
};

export function mylTypeLabel(type: string) {
  return TYPE_LABELS[type] || type || "Otro";
}

export function mylSlotKey(card: { id?: string; name: string; editionId?: string; edid?: string }) {
  if (card.id) return String(card.id);
  return `${card.name}|${card.editionId || ""}|${card.edid || ""}`;
}

export function mylDeckTotal(slots: MylDeckSlot[]) {
  return slots.reduce((s, c) => s + c.qty, 0);
}

export function mylAllyCount(slots: MylDeckSlot[]) {
  return slots.filter((s) => s.type === "aliado").reduce((n, s) => n + s.qty, 0);
}

export function mylSlotsByType(slots: MylDeckSlot[]) {
  const groups: Record<string, MylDeckSlot[]> = {
    aliado: [],
    talisman: [],
    arma: [],
    totem: [],
    oro: [],
    monumento: [],
    otro: [],
  };
  for (const s of slots) {
    const t = groups[s.type] ? s.type : "otro";
    groups[t].push(s);
  }
  const sort = (a: MylDeckSlot, b: MylDeckSlot) => a.name.localeCompare(b.name, "es");
  for (const k of Object.keys(groups)) groups[k].sort(sort);
  const totals: Record<string, number> = {};
  for (const [k, list] of Object.entries(groups)) totals[k] = mylDeckTotal(list);
  return { groups, totals };
}

export function addMylCardToDeck(slots: MylDeckSlot[], card: MylCardSearchResult): MylDeckSlot[] {
  const total = mylDeckTotal(slots);
  if (total >= MYL_DECK_SIZE) return slots;
  const key = mylSlotKey(card);
  const existing = slots.find((s) => s.key === key);
  if (existing) {
    if (existing.qty >= MYL_MAX_COPIES) return slots;
    if (total + 1 > MYL_DECK_SIZE) return slots;
    return slots.map((s) => (s.key === key ? { ...s, qty: s.qty + 1 } : s));
  }
  return [
    ...slots,
    {
      key,
      name: card.name,
      type: card.type || "otro",
      typeLabel: card.typeLabel || mylTypeLabel(String(card.type || "otro")),
      qty: 1,
      editionId: card.editionId,
      editionSlug: card.editionSlug,
      edid: card.edid,
      image: card.image,
    },
  ];
}

export function removeMylSlot(slots: MylDeckSlot[], key: string): MylDeckSlot[] {
  const hit = slots.find((s) => s.key === key);
  if (!hit) return slots;
  if (hit.qty <= 1) return slots.filter((s) => s.key !== key);
  return slots.map((s) => (s.key === key ? { ...s, qty: s.qty - 1 } : s));
}

/** Exporta lista estilo mazos.cl / deckbuilders: `3x Nombre` */
export function mylSlotsToRawText(slots: MylDeckSlot[]): string {
  return [...slots]
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((s) => `${s.qty}x ${s.name}`)
    .join("\n");
}

const LINE_RE = /^(\d+)\s*[xX×]?\s+(.+)$/;

export function importMylRawTextToSlots(rawText: string): { slots: MylDeckSlot[]; errors: string[] } {
  const errors: string[] = [];
  const map = new Map<string, MylDeckSlot>();
  for (const raw of String(rawText || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const m = line.match(LINE_RE);
    if (!m) {
      errors.push(`Línea no reconocida: ${line}`);
      continue;
    }
    const qty = parseInt(m[1], 10);
    const name = m[2].trim();
    if (!Number.isFinite(qty) || qty < 1 || qty > MYL_DECK_SIZE) {
      errors.push(`Cantidad inválida: ${line}`);
      continue;
    }
    if (!name) continue;
    const key = mylSlotKey({ name });
    const prev = map.get(key);
    if (prev) {
      prev.qty = Math.min(MYL_MAX_COPIES, prev.qty + qty);
    } else {
      map.set(key, {
        key,
        name,
        type: "otro",
        typeLabel: "Carta",
        qty: Math.min(MYL_MAX_COPIES, qty),
      });
    }
  }
  let slots = [...map.values()];
  let total = mylDeckTotal(slots);
  if (total > MYL_DECK_SIZE) {
    errors.push(`La lista supera ${MYL_DECK_SIZE} cartas (${total}).`);
    while (total > MYL_DECK_SIZE && slots.length) {
      const last = slots[slots.length - 1];
      const drop = Math.min(last.qty, total - MYL_DECK_SIZE);
      last.qty -= drop;
      total -= drop;
      if (last.qty <= 0) slots.pop();
    }
  }
  return { slots, errors };
}

export function needsRaceForConstruction(construction: MylDeckConstruction | string) {
  const c = String(construction || "soporte-libre");
  return c !== "libre" && c !== "full";
}

/**
 * Legalidad de construcción JO (tamaño, copias, mínimo de Aliados en racial).
 * El filtro por raza/edición lo hace el catálogo de búsqueda; acá validamos conteos.
 */
export function getMylDeckLegality(
  slots: MylDeckSlot[],
  opts?: { deckFormat?: MylDeckConstruction | string }
) {
  const total = mylDeckTotal(slots);
  const allies = mylAllyCount(slots);
  const deckFormat = String(opts?.deckFormat || "soporte-libre");
  const isRacial = deckFormat === "racial" || deckFormat === "soporte-libre" || deckFormat === "soporte-edicion";
  const errors: string[] = [];
  const warnings: string[] = [];

  if (total !== MYL_DECK_SIZE) {
    errors.push(`El mazo debe tener ${MYL_DECK_SIZE} cartas (ahora ${total}).`);
  }
  for (const s of slots) {
    if (s.qty > MYL_MAX_COPIES) {
      errors.push(`Máximo ${MYL_MAX_COPIES} copias de ${s.name}.`);
    }
  }
  if (isRacial && allies < MYL_MIN_ALLIES_RACIAL) {
    errors.push(
      `En racial necesitás al menos ${MYL_MIN_ALLIES_RACIAL} Aliados (ahora ${allies}).`
    );
  } else if (isRacial && allies < MYL_MIN_ALLIES_RACIAL + 4 && allies >= MYL_MIN_ALLIES_RACIAL) {
    warnings.push(`Vas justo de Aliados (${allies}). El mínimo JO es ${MYL_MIN_ALLIES_RACIAL}.`);
  }

  return {
    legal: errors.length === 0,
    errors,
    warnings,
    total,
    allies,
    minAllies: isRacial ? MYL_MIN_ALLIES_RACIAL : 0,
  };
}

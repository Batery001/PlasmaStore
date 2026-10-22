import type { DeckCardCategory } from "./deckParser";
import { parsePokemonDecklist } from "./deckParser";

export type DeckFormat = "standard" | "expanded" | "glc";
export type DeckTypeFilter = "all" | "pokemon" | "trainer" | "energy";

export interface DeckBuilderSlot {
  key: string;
  name: string;
  category: DeckCardCategory;
  qty: number;
  setCode?: string;
  number?: string;
  image?: string;
  tcgdexId?: string;
}

export interface CardSearchResult {
  id: string;
  name: string;
  category: DeckCardCategory;
  setCode?: string;
  number?: string;
  image?: string;
}

export function deckSlotKey(card: {
  name: string;
  setCode?: string;
  number?: string;
  tcgdexId?: string;
}): string {
  if (card.tcgdexId) return card.tcgdexId;
  return `${card.name}|${card.setCode ?? ""}|${card.number ?? ""}`;
}

export function deckTotal(slots: DeckBuilderSlot[]): number {
  return slots.reduce((s, c) => s + c.qty, 0);
}

export function slotsByCategory(slots: DeckBuilderSlot[]) {
  const pokemon: DeckBuilderSlot[] = [];
  const trainer: DeckBuilderSlot[] = [];
  const energy: DeckBuilderSlot[] = [];
  for (const s of slots) {
    if (s.category === "energy") energy.push(s);
    else if (s.category === "trainer") trainer.push(s);
    else pokemon.push(s);
  }
  const sort = (a: DeckBuilderSlot, b: DeckBuilderSlot) =>
    a.name.localeCompare(b.name, "es");
  return {
    pokemon: pokemon.sort(sort),
    trainer: trainer.sort(sort),
    energy: energy.sort(sort),
    totals: {
      pokemon: deckTotal(pokemon),
      trainer: deckTotal(trainer),
      energy: deckTotal(energy),
    },
  };
}

function formatLine(slot: DeckBuilderSlot): string {
  if (slot.category === "pokemon" && slot.setCode && slot.number) {
    return `${slot.qty} ${slot.name} ${slot.setCode} ${slot.number}`;
  }
  if (slot.setCode && slot.number) {
    return `${slot.qty} ${slot.name} ${slot.setCode} ${slot.number}`;
  }
  return `${slot.qty} ${slot.name}`;
}

/** Exporta al formato de 3 bloques (Pokémon / Entrenadores / Energías). */
export function deckSlotsToRawText(slots: DeckBuilderSlot[]): string {
  const { pokemon, trainer, energy } = slotsByCategory(slots);
  return [
    pokemon.map(formatLine).join("\n"),
    "",
    trainer.map(formatLine).join("\n"),
    "",
    energy.map(formatLine).join("\n"),
  ]
    .join("\n")
    .trim();
}

export function importRawTextToSlots(rawText: string): {
  slots: DeckBuilderSlot[];
  errors: string[];
} {
  const parsed = parsePokemonDecklist(rawText);
  const slots: DeckBuilderSlot[] = parsed.cards.map((c) => ({
    key: deckSlotKey({
      name: c.name,
      setCode: c.setCode,
      number: c.number,
    }),
    name: c.name,
    category: c.category,
    qty: c.qty,
    setCode: c.setCode,
    number: c.number,
  }));
  return { slots, errors: parsed.errors };
}

export function changeSlotQty(
  slots: DeckBuilderSlot[],
  key: string,
  delta: number,
  maxCopies = 4
): DeckBuilderSlot[] {
  const idx = slots.findIndex((s) => s.key === key);
  if (idx === -1) return slots;
  const slot = slots[idx];
  const isBasic =
    slot.category === "energy" &&
    /^(?:\d+\s+)?(?:basic\s+)?\w+\s+energy$/i.test(slot.name);
  const cap = isBasic ? 60 : maxCopies;
  const nextQty = slot.qty + delta;
  if (nextQty <= 0) {
    return slots.filter((s) => s.key !== key);
  }
  if (nextQty > cap) return slots;
  const copy = [...slots];
  copy[idx] = { ...slot, qty: nextQty };
  return copy;
}

/** Cartas expandidas (una por copia) para la tira visual tipo RK9. */
export function expandSlotsForStrip(slots: DeckBuilderSlot[]): DeckBuilderSlot[] {
  return slots.flatMap((s) => Array.from({ length: s.qty }, () => s));
}

export function removeSlot(
  slots: DeckBuilderSlot[],
  key: string
): DeckBuilderSlot[] {
  return slots.filter((s) => s.key !== key);
}

export function getDeckLegality(
  slots: DeckBuilderSlot[],
  format: DeckFormat
): { legal: boolean; message: string } {
  const total = deckTotal(slots);
  const formatLabel =
    format === "standard"
      ? "Standard"
      : format === "expanded"
        ? "Expanded"
        : "GLC";

  if (total !== 60) {
    return {
      legal: false,
      message: `Mazo ${formatLabel} aún no legal`,
    };
  }

  const parsed = parsePokemonDecklist(deckSlotsToRawText(slots));
  if (!parsed.isValid) {
    return {
      legal: false,
      message: parsed.errors[0] ?? `Mazo ${formatLabel} aún no legal`,
    };
  }

  return {
    legal: true,
    message: `Mazo ${formatLabel} legal`,
  };
}

export function addSearchResultToDeck(
  slots: DeckBuilderSlot[],
  card: CardSearchResult,
  deckTotalLimit = 60
): DeckBuilderSlot[] {
  const key = deckSlotKey({ name: card.name, setCode: card.setCode, number: card.number, tcgdexId: card.id });
  const total = deckTotal(slots);
  if (total >= deckTotalLimit) return slots;

  const existing = slots.find((s) => s.key === key);
  if (existing) {
    return changeSlotQty(slots, key, 1);
  }

  return [
    ...slots,
    {
      key,
      name: card.name,
      category: card.category,
      qty: 1,
      setCode: card.setCode,
      number: card.number,
      image: card.image,
      tcgdexId: card.id,
    },
  ];
}

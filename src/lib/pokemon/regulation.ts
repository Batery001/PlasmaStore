import { isBasicEnergy, type ParsedDeckCard } from "./deckParser";

export const REGULATION_MARKS = ["G", "H", "I", "J"] as const;
export type RegulationMark = (typeof REGULATION_MARKS)[number];

/** Standard vigente aproximado 2026; la tienda puede incluir G en locales. */
export const DEFAULT_REGULATION_MARKS: RegulationMark[] = ["H", "I", "J"];

/** Códigos Limitless/PTCGL → marca, si TCGdex no responde. */
export const SET_REGULATION_MARK: Record<string, RegulationMark> = {
  SVI: "G",
  PAL: "G",
  OBF: "G",
  MEW: "G",
  PAR: "G",
  PAF: "G",
  TEF: "G",
  TWM: "H",
  SFA: "H",
  SCR: "H",
  SSP: "H",
  PRE: "H",
  JTG: "I",
  DRI: "I",
  BLK: "I",
  WHT: "I",
  MEG: "I",
  PFL: "I",
  ASC: "I",
  POR: "J",
  SVP: "H",
  SVE: "H",
  MEP: "I",
  MEE: "I",
};

export function normalizeRegulationMarks(
  raw: unknown
): RegulationMark[] {
  if (!Array.isArray(raw)) return [...DEFAULT_REGULATION_MARKS];
  const allowed = new Set<RegulationMark>(REGULATION_MARKS);
  const marks = raw
    .map((m) => String(m).trim().toUpperCase())
    .filter((m): m is RegulationMark => allowed.has(m as RegulationMark));
  return marks.length > 0 ? [...new Set(marks)] : [...DEFAULT_REGULATION_MARKS];
}

export function regulationMarkForSet(setCode: string | undefined): RegulationMark | null {
  if (!setCode) return null;
  return SET_REGULATION_MARK[setCode.trim().toUpperCase()] ?? null;
}

export function formatMarksList(marks: string[]): string {
  return marks.map((m) => m.toUpperCase()).join(", ");
}

export function checkRegulationMarks(
  cards: ParsedDeckCard[],
  allowedMarks: string[]
): { errors: string[]; warnings: string[] } {
  const allowed = new Set(
    allowedMarks.map((m) => m.trim().toUpperCase()).filter(Boolean)
  );
  const errors: string[] = [];
  const warnings: string[] = [];
  if (allowed.size === 0) return { errors, warnings };

  const seen = new Set<string>();

  for (const card of cards) {
    if (isBasicEnergy(card.name)) continue;
    // Entrenadores y energías: cualquier impresión si el efecto está en Standard
    // (regla de reimpresión). Solo los Pokémon se filtran por marca del set.
    if (card.category === "trainer" || card.category === "energy") continue;

    const mark =
      card.regulationMark?.trim().toUpperCase() ||
      regulationMarkForSet(card.setCode);
    const label = card.setCode
      ? `${card.name} (${card.setCode}${card.number ? ` ${card.number}` : ""})`
      : card.name;
    const key = `${label}|${mark ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (!mark) {
      if (card.setCode) {
        warnings.push(
          `No se pudo comprobar la regulación de ${label}. Revisa que sea legal en Standard.`
        );
      }
      continue;
    }

    if (!allowed.has(mark)) {
      errors.push(
        `${label} es regulación ${mark}. Este torneo admite ${formatMarksList([...allowed])}.`
      );
    }
  }

  return { errors, warnings };
}

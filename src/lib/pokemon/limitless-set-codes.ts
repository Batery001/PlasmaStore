/**
 * Códigos de expansión usados en exportaciones Limitless / PTCGL → ID de set en TCGdex.
 * @see https://api.tcgdex.net/v2/en/sets
 */
export const LIMITLESS_TO_TCGDEX_SET: Record<string, string> = {
  // Scarlet & Violet
  SVI: "sv01",
  PAL: "sv02",
  OBF: "sv03",
  MEW: "sv03.5",
  PAR: "sv04",
  PAF: "sv04.5",
  TEF: "sv05",
  TWM: "sv06",
  SFA: "sv06.5",
  SCR: "sv07",
  SSP: "sv08",
  PRE: "sv08.5",
  JTG: "sv09",
  DRI: "sv10",
  BLK: "sv10.5b",
  WHT: "sv10.5w",
  SVP: "svp",
  SVE: "sve",
  // Mega Evolution
  MEG: "me01",
  PFL: "me02",
  ASC: "me02.5",
  POR: "me03",
  MEP: "mep",
  MEE: "mee",
  // Sword & Shield (frecuentes en mazos legacy)
  SSH: "swsh1",
  RCL: "swsh2",
  DAA: "swsh3",
  CPA: "swsh3.5",
  VIV: "swsh4",
  SHF: "swsh4.5",
  BST: "swsh5",
  CRE: "swsh6",
  EVS: "swsh7",
  CEL: "cel25",
  FST: "swsh8",
  BRS: "swsh9",
  ASR: "swsh10",
  PGO: "swsh10.5",
  LOR: "swsh11",
  SIT: "swsh12",
  CRZ: "swsh12.5",
  // Energías básicas clásicas
  HS: "hgss1",
};

export function limitlessSetToTcgdex(setCode: string): string | null {
  const key = setCode.trim().toUpperCase();
  return LIMITLESS_TO_TCGDEX_SET[key] ?? null;
}

const TCGDEX_TO_LIMITLESS: Record<string, string> = Object.fromEntries(
  Object.entries(LIMITLESS_TO_TCGDEX_SET).map(([ll, tcx]) => [tcx, ll])
);

/** Código Limitless/PTCGL a partir del id de set TCGdex (`sv06`, `me02.5`, …). */
export function tcgdexSetToLimitless(tcgdexSetId: string): string | null {
  return TCGDEX_TO_LIMITLESS[tcgdexSetId] ?? null;
}

export function parseTcgdexCardId(
  id: string
): { tcgdexSetId: string; localId: string } | null {
  const match = id.match(/^(.+)-([^-]+)$/);
  if (!match) return null;
  return { tcgdexSetId: match[1], localId: match[2] };
}

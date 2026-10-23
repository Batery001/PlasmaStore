import { limitlessSetToTcgdex } from "./limitless-set-codes";
import { tcgdexSeriesFromSetId, tcgdxImageVariants } from "./tcgdex-image";

function padNum(number: string): string {
  const digits = String(number || "").replace(/\D/g, "");
  if (!digits) return String(number || "").trim();
  return digits.padStart(3, "0");
}

/** URLs candidatas Limitless (varias rarezas) + TCGdex. */
export function cardImageCandidates(setCode?: string, number?: string): string[] {
  const set = String(setCode || "")
    .trim()
    .toUpperCase();
  const num = String(number || "").trim();
  if (!set || !num) return [];

  const n = padNum(num);
  const out: string[] = [];
  const limBase = `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${set}/${set}_${n}`;
  for (const suf of ["_R_EN_LG", "_U_EN_LG", "_C_EN_LG", "_RH_EN_LG", "_RR_EN_LG", "_R_EN", "_U_EN"]) {
    out.push(`${limBase}${suf}.png`);
  }

  const tcgdexSet = limitlessSetToTcgdex(set);
  if (tcgdexSet) {
    const series = tcgdexSeriesFromSetId(tcgdexSet);
    const base = `https://assets.tcgdex.net/en/${series}/${tcgdexSet}/${n}`;
    out.push(...tcgdxImageVariants(base));
    // localId a veces sin padding
    const bare = num.replace(/^0+/, "") || num;
    if (bare !== n) {
      const base2 = `https://assets.tcgdex.net/en/${series}/${tcgdexSet}/${bare}`;
      out.push(...tcgdxImageVariants(base2));
    }
  }

  return [...new Set(out)];
}

export function primaryCardImageUrl(setCode?: string, number?: string): string | undefined {
  return cardImageCandidates(setCode, number)[0];
}

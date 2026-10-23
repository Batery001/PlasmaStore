export type MylCardType = "aliado" | "talisman" | "arma" | "totem" | "oro" | "monumento" | "otro";

export type MylCardSearchResult = {
  id: string;
  name: string;
  slug?: string;
  type: MylCardType | string;
  typeLabel?: string;
  editionId?: string;
  editionSlug?: string;
  edid?: string;
  image?: string;
  era?: string | null;
  race?: string | null;
};

export async function searchMylCardsClient(opts: {
  query?: string;
  type?: string;
  era?: string;
  race?: string;
  deckFormat?: string;
}): Promise<{ cards: MylCardSearchResult[]; error?: string }> {
  const q = String(opts.query || "").trim();
  const race = String(opts.race || "").trim();
  const deckFormat = String(opts.deckFormat || "soporte-libre").trim();
  const isLibre = deckFormat === "libre";
  if (q.length < 2 && !race && !isLibre) return { cards: [] };
  if (q.length < 2 && isLibre && !opts.era) return { cards: [] };
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (opts.type && opts.type !== "all") params.set("type", opts.type);
  if (opts.era) params.set("era", opts.era);
  if (race) params.set("race", race);
  if (deckFormat) params.set("deckFormat", deckFormat);
  try {
    const res = await fetch(`/api/store/myl/cards/search?${params}`);
    const data = (await res.json()) as { ok?: boolean; cards?: MylCardSearchResult[]; error?: string };
    if (!res.ok) return { cards: [], error: data.error || "No se pudo buscar cartas MyL." };
    return { cards: data.cards || [] };
  } catch {
    return { cards: [], error: "Error de red al buscar cartas MyL." };
  }
}

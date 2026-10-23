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
};

export async function searchMylCardsClient(opts: {
  query: string;
  type?: string;
}): Promise<{ cards: MylCardSearchResult[]; error?: string }> {
  const q = opts.query.trim();
  if (q.length < 2) return { cards: [] };
  const params = new URLSearchParams({ q });
  if (opts.type && opts.type !== "all") params.set("type", opts.type);
  try {
    const res = await fetch(`/api/store/myl/cards/search?${params}`);
    const data = (await res.json()) as { ok?: boolean; cards?: MylCardSearchResult[]; error?: string };
    if (!res.ok) return { cards: [], error: data.error || "No se pudo buscar cartas MyL." };
    return { cards: data.cards || [] };
  } catch {
    return { cards: [], error: "Error de red al buscar cartas MyL." };
  }
}

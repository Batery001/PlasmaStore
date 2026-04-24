const POKEAPI_POKEMON_LIST_URL = "https://pokeapi.co/api/v2/pokemon?limit=1350";
const SPRITE_VERSIONS_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions";

/** @type {Promise<{ id: number; name: string }[]> | null} */
let pokeapiPokemonListPromise = null;

function getPokeapiPokemonList() {
  if (!pokeapiPokemonListPromise) {
    pokeapiPokemonListPromise = (async () => {
      const r = await fetch(POKEAPI_POKEMON_LIST_URL, {
        headers: { "User-Agent": "PlasmaStore-api/1.0" },
      });
      if (!r.ok) throw new Error(`PokeAPI (lista pokemon) respondió ${r.status}`);
      const j = await r.json();
      const out = [];
      for (const row of j.results || []) {
        const m = String(row.url || "").match(/\/(\d+)\/?$/);
        const id = m ? parseInt(m[1], 10) : 0;
        if (id) out.push({ id, name: String(row.name || "") });
      }
      return out;
    })();
  }
  return pokeapiPokemonListPromise;
}

function menuIconUrlHeuristic(id) {
  return `${SPRITE_VERSIONS_BASE}/generation-viii/icons/${id}.png`;
}

const pokemonDeckMenuIconUrlById = new Map();

async function resolvePokemonDeckDisplayUrl(id) {
  const k = String(id);
  if (pokemonDeckMenuIconUrlById.has(k)) return pokemonDeckMenuIconUrlById.get(k);
  let url = menuIconUrlHeuristic(id);
  try {
    const r = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}/`, {
      headers: { "User-Agent": "PlasmaStore-api/1.0" },
    });
    if (r.ok) {
      const p = await r.json();
      url =
        p?.sprites?.versions?.["generation-ix"]?.["scarlet-violet"]?.front_default ||
        p?.sprites?.versions?.["generation-viii"]?.icons?.front_default ||
        p?.sprites?.versions?.["generation-vii"]?.icons?.front_default ||
        url;
    }
  } catch {
    /* url heurística */
  }
  pokemonDeckMenuIconUrlById.set(k, url);
  return url;
}

async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    for (;;) {
      const j = i;
      i += 1;
      if (j >= items.length) return;
      out[j] = await fn(items[j], j);
    }
  }
  const n = Math.min(limit, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

export async function pokemonCardSearch(qRaw) {
  const raw = String(qRaw || "")
    .trim()
    .slice(0, 80)
    .toLowerCase();
  if (raw.length < 1) {
    return { ok: true, source: "pokeapi/pokemon", cards: [] };
  }
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { ok: true, source: "pokeapi/pokemon", cards: [] };
  }
  const all = await getPokeapiPokemonList();
  const hits = [];
  for (const p of all) {
    const n = p.name.toLowerCase();
    if (tokens.every((t) => n.includes(t))) hits.push(p);
  }
  const t0 = tokens[0];
  hits.sort((a, b) => {
    const na = a.name.toLowerCase();
    const nb = b.name.toLowerCase();
    const aStarts = na.startsWith(t0) ? 0 : 1;
    const bStarts = nb.startsWith(t0) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    if (a.name.length !== b.name.length) return a.name.length - b.name.length;
    return na.localeCompare(nb);
  });
  const max = 60;
  const slice = hits.slice(0, max);
  const partySpriteUrls = await mapWithConcurrency(slice, 8, (p) => resolvePokemonDeckDisplayUrl(p.id));
  const cards = slice.map((p, idx) => {
    const partySpriteUrl = partySpriteUrls[idx];
    const displayName = p.name.replace(/-/g, " ");
    return {
      id: String(p.id),
      name: p.name,
      displayName,
      setId: `#${p.id}`,
      number: "",
      setName: "Pokémon",
      imageSmall: partySpriteUrl,
      partySpriteUrl,
    };
  });
  return {
    ok: true,
    source: "pokeapi.co/api/v2/pokemon",
    cards,
  };
}

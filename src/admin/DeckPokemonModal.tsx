import { useCallback, useEffect, useRef, useState } from "react";
import { parseResponseJson } from "../lib/parseResponseJson";
import { DeckSpriteImg } from "../lib/DeckSpriteImg";
import { DECK_SPRITE_MODAL_LIST_PX, DECK_SPRITE_MODAL_SELECTED_PX } from "../lib/deckSpriteSizes";
import styles from "./deckModal.module.css";

export type CardPick = {
  id: string;
  /** Slug PokeAPI (p. ej. charizard-mega-x). */
  name: string;
  /** Nombre legible con espacios. */
  displayName: string;
  setId: string;
  setName?: string;
  number: string;
  imageSmall: string;
  partySpriteUrl: string;
};

type SearchRes = {
  ok?: boolean;
  error?: string;
  cards?: CardPick[];
};

type InitialDeck = {
  sprites: string[];
  countryCode: string;
  listUrl: string;
};

function PokemonCombo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CardPick | null;
  onChange: (c: CardPick | null) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hits, setHits] = useState<CardPick[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const limitlessBrowseUrl = "https://www.limitlesstcg.com/cards";

  const runSearch = useCallback(async (term: string) => {
    const t = term.trim().toLowerCase();
    if (t.length < 1) {
      setHits([]);
      setErr(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/public/pokemon-card-search?q=${encodeURIComponent(t)}`);
      const data = await parseResponseJson<SearchRes>(res);
      if (!res.ok || data.ok === false) throw new Error(data.error || "Error de búsqueda");
      setHits(Array.isArray(data.cards) ? data.cards : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
      setHits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (value) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!open && q.trim().length < 1) return;
    debounceRef.current = setTimeout(() => {
      void runSearch(q);
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, runSearch, open, value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className={styles.comboWrap} ref={wrapRef}>
      <label className={styles.fieldLabel}>{label}</label>
      {!value ? (
        <>
          <input
            className={styles.searchInput}
            placeholder="Selecciona…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
        </>
      ) : (
        <div className={styles.selectedRow}>
          {value.partySpriteUrl ? (
            <DeckSpriteImg
              src={value.partySpriteUrl}
              size={DECK_SPRITE_MODAL_SELECTED_PX}
              variant="light"
              alt={value.displayName || value.name.replace(/-/g, " ")}
              className={styles.partySpriteWrap}
            />
          ) : null}
          <span>
            {value.displayName || value.name.replace(/-/g, " ")} · {value.setId}
          </span>
          <button
            type="button"
            className={styles.clearMini}
            onClick={() => {
              onChange(null);
              setQ("");
              setHits([]);
              setOpen(false);
            }}
          >
            Cambiar
          </button>
        </div>
      )}
      {!value && open && (q.trim().length >= 1 || loading) && (
        <div className={styles.dropdown}>
          {loading && <div className={styles.loading}>Buscando…</div>}
          {err && <div className={styles.err}>{err}</div>}
          {!loading &&
            hits.map((c) => (
              <button
                key={c.id}
                type="button"
                className={styles.option}
                onClick={() => {
                  onChange(c);
                  setQ("");
                  setOpen(false);
                }}
              >
                {c.partySpriteUrl ? (
                  <DeckSpriteImg
                    src={c.partySpriteUrl}
                    size={DECK_SPRITE_MODAL_LIST_PX}
                    variant="light"
                    alt={c.displayName || c.name.replace(/-/g, " ")}
                    className={styles.partySpriteOptWrap}
                  />
                ) : null}
                <span className={styles.optionMeta}>
                  <span className={styles.optionName}>{c.displayName || c.name.replace(/-/g, " ")}</span>
                  <span className={styles.optionSet}>
                    {c.name} · {c.setId}
                  </span>
                </span>
              </button>
            ))}
          {!loading && !err && q.trim().length >= 1 && hits.length === 0 && (
            <div className={styles.loading}>Sin resultados. Prueba en{" "}
              <a href={limitlessBrowseUrl} target="_blank" rel="noreferrer">
                Limitless
              </a>
              .
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  initial: InitialDeck;
  onSaved: (payload: { sprites: string[]; countryCode: string; listUrl: string }) => Promise<void>;
};

export function DeckPokemonModal({ open, onClose, initial, onSaved }: Props) {
  const [p1, setP1] = useState<CardPick | null>(null);
  const [p2, setP2] = useState<CardPick | null>(null);
  const [cc, setCc] = useState("");
  const [listUrl, setListUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const seed = JSON.stringify(initial);
  useEffect(() => {
    if (!open) return;
    try {
      const o = JSON.parse(seed) as InitialDeck;
      setCc(o.countryCode || "");
      setListUrl(o.listUrl || "");
      setP1(null);
      setP2(null);
      const s = o.sprites || [];
      if (s[0] || s[1]) {
        setP1(
          s[0]
            ? {
                id: "saved-0",
                name: "guardado",
                displayName: "Sprite guardado",
                setId: "—",
                number: "—",
                imageSmall: s[0],
                partySpriteUrl: s[0],
              }
            : null,
        );
        setP2(
          s[1]
            ? {
                id: "saved-1",
                name: "guardado",
                displayName: "Sprite guardado",
                setId: "—",
                number: "—",
                imageSmall: s[1],
                partySpriteUrl: s[1],
              }
            : null,
        );
      }
    } catch {
      setCc("");
      setListUrl("");
      setP1(null);
      setP2(null);
    }
  }, [open, seed]);

  async function onSubmit() {
    setErr(null);
    const sprites = [p1?.partySpriteUrl, p2?.partySpriteUrl].map((x) => String(x || "").trim()).filter(Boolean);
    if (sprites.length === 0) {
      setErr("Elige al menos un Pokémon (cartas) para guardar sprites.");
      return;
    }
    setBusy(true);
    try {
      await onSaved({
        sprites,
        countryCode: cc.trim().toUpperCase().slice(0, 2),
        listUrl: listUrl.trim(),
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="deck-modal-title">
        <div className={styles.head}>
          <h2 id="deck-modal-title" className={styles.title}>
            Agregue los 2 Pokémon más icónicos del deck
          </h2>
          <button type="button" className={styles.close} aria-label="Cerrar" onClick={onClose}>
            ×
          </button>
        </div>
        <div className={styles.body}>
          <p className={styles.hint}>
            Escribe el <strong>nombre del Pokémon</strong> (no la carta): el servidor usa la lista{" "}
            <a href="https://pokeapi.co/api/v2/pokemon?limit=1350" target="_blank" rel="noreferrer">
              /api/v2/pokemon?limit=1350
            </a>{" "}
            de{" "}
            <a href="https://pokeapi.co/" target="_blank" rel="noreferrer">
              PokeAPI
            </a>
            . Varias palabras se combinan: p. ej. <strong>mega</strong> muestra todas las entradas con «mega»;{" "}
            <strong>mega char</strong> acota a las que contienen «mega» y «char» (p. ej. charizard-mega-x). Las
            miniaturas son los <strong>iconos de menú/caja</strong> del juego (Escarlata/Púrpura o Espada/Escudo, según
            PokeAPI), como en el PC o el equipo. Si en datos guardas solo el <strong>slug</strong> (p. ej.{" "}
            <code>dragapult</code>), en
            standings se muestra el sprite Gen 9 de{" "}
            <a href="https://limitlesstcg.com" target="_blank" rel="noreferrer">
              Limitless
            </a>{" "}
            (<code>r2.limitlesstcg.net/pokemon/gen9</code>).
          </p>

          <PokemonCombo label="Pokémon 1" value={p1} onChange={setP1} />
          <PokemonCombo label="Pokémon 2" value={p2} onChange={setP2} />

          <div className={styles.row2}>
            <div>
              <label className={styles.fieldLabel}>País (ISO2)</label>
              <input
                className={styles.inputSm}
                value={cc}
                onChange={(e) => setCc(e.target.value.toUpperCase())}
                maxLength={2}
                placeholder="CL"
              />
            </div>
            <div>
              <label className={styles.fieldLabel}>Enlace lista</label>
              <input
                className={styles.inputSm}
                value={listUrl}
                onChange={(e) => setListUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>
          {err ? <p className={styles.err}>{err}</p> : null}
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.btnGhost} disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => void onSubmit()}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

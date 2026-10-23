import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addSearchResultToDeck,
  deckSlotsToRawText,
  deckTotal,
  getDeckLegality,
  importRawTextToSlots,
  removeSlot,
  slotsByCategory,
  type CardSearchResult,
  type DeckBuilderSlot,
  type DeckFormat,
  type DeckTypeFilter,
} from "../../lib/pokemon/deck-builder";
import { tcgdxImageVariants } from "../../lib/pokemon/tcgdex-image";
import styles from "../../screens/pages.module.css";

const FORMATS: { id: DeckFormat; label: string }[] = [
  { id: "standard", label: "Standard" },
  { id: "expanded", label: "Expanded" },
  { id: "glc", label: "GLC" },
];

const TYPE_FILTERS: { id: DeckTypeFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "pokemon", label: "Pokémon" },
  { id: "trainer", label: "Entrenadores" },
  { id: "energy", label: "Energías" },
];

function formatCardCode(card: { setCode?: string; number?: string }): string {
  if (card.setCode && card.number) return `${card.setCode}-${card.number}`;
  if (card.setCode) return card.setCode;
  return "";
}

function CardImage({ image, name }: { image?: string; name: string }) {
  const variants = useMemo(() => tcgdxImageVariants(image), [image]);
  const [variantIndex, setVariantIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setVariantIndex(0);
    setFailed(false);
  }, [image]);
  const src = !failed ? variants[variantIndex] : undefined;
  if (!src) {
    return (
      <div
        style={{
          width: "3.5rem",
          height: "4.8rem",
          fontSize: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: 2,
        }}
      >
        {name}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      loading="lazy"
      style={{ width: "3.5rem", height: "4.8rem", objectFit: "cover", borderRadius: 4 }}
      onError={() => {
        setVariantIndex((i) => {
          if (i + 1 < variants.length) return i + 1;
          setFailed(true);
          return i;
        });
      }}
    />
  );
}

export function DeckBuilder({
  onRawTextReady,
  initialRawText,
  applyListLabel = "Usar esta lista",
}: {
  onRawTextReady?: (rawText: string) => void;
  initialRawText?: string;
  applyListLabel?: string;
}) {
  const [format, setFormat] = useState<DeckFormat>("standard");
  const [typeFilter, setTypeFilter] = useState<DeckTypeFilter>("all");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [slots, setSlots] = useState<DeckBuilderSlot[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const total = deckTotal(slots);
  const grouped = slotsByCategory(slots);
  const legality = useMemo(() => getDeckLegality(slots, format), [slots, format]);

  const runSearch = useCallback(async () => {
    if (query.trim().length < 1) {
      setResults([]);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      // Búsqueda en el servidor (TCGdex): incluye MEP/MEE y evita bloqueos CORS del navegador.
      const params = new URLSearchParams({
        q: query.trim(),
        type: typeFilter,
        format,
      });
      const res = await fetch(`/api/store/cards/search?${params}`);
      const data = (await res.json()) as { cards?: CardSearchResult[]; error?: string };
      if (!res.ok) {
        setResults([]);
        setSearchError(data.error ?? "No se pudo buscar cartas");
        return;
      }
      setResults(data.cards ?? []);
    } catch {
      setResults([]);
      setSearchError("Error de red al buscar cartas");
    } finally {
      setSearching(false);
    }
  }, [query, typeFilter, format]);

  useEffect(() => {
    const t = setTimeout(() => void runSearch(), 300);
    return () => clearTimeout(t);
  }, [runSearch]);

  useEffect(() => {
    if (!initialRawText?.trim()) return;
    const { slots: imported } = importRawTextToSlots(initialRawText);
    if (imported.length > 0) setSlots(imported);
  }, [initialRawText]);

  function handleAddCard(card: CardSearchResult) {
    if (total >= 60) return;
    setSlots((prev) => addSearchResultToDeck(prev, card));
  }

  function handlePasteImport() {
    const { slots: imported, errors } = importRawTextToSlots(pasteText);
    if (errors.length && deckTotal(imported) !== 60) {
      setError(errors.slice(0, 2).join(" "));
      if (imported.length === 0) return;
    }
    setSlots(imported);
    setPasteOpen(false);
    setPasteText("");
    setError(null);
  }

  function handleCreateList() {
    const rawText = deckSlotsToRawText(slots);
    if (!legality.legal) {
      setError("Completa un mazo legal de 60 cartas antes de crear la lista.");
      return;
    }
    onRawTextReady?.(rawText);
  }

  const hasQuery = query.trim().length > 0;

  return (
    <div style={{ display: "grid", gap: "1rem", width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <p className={styles.muted}>
        Busca cartas o{" "}
        <button type="button" className={styles.linkbtn} onClick={() => setPasteOpen(true)}>
          importa desde PTCGL
        </button>
        . Toca un resultado para sumar; toca una fila del mazo para quitar.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "end" }}>
        <div>
          <span className={styles.muted} style={{ display: "block", marginBottom: 4, fontSize: 12 }}>
            Formato
          </span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={format === f.id ? styles.btnPrimary : styles.btnGhost}
                style={{ padding: "0.35rem 0.65rem", fontSize: 12 }}
                onClick={() => setFormat(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className={styles.muted} style={{ display: "block", marginBottom: 4, fontSize: 12 }}>
            Tipo
          </span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {TYPE_FILTERS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={typeFilter === t.id ? styles.btnPrimary : styles.btnGhost}
                style={{ padding: "0.35rem 0.65rem", fontSize: 12 }}
                onClick={() => setTypeFilter(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className={styles.label}>
        Buscar carta
        <input
          className={styles.input}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nombre de la carta"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "0.75rem",
          background: "var(--card)",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        {searching && hasQuery ? <p className={styles.muted}>Buscando…</p> : null}
        {hasQuery && !searching && searchError ? <p className={styles.error}>{searchError}</p> : null}
        {hasQuery && !searching && !searchError && results.length === 0 ? (
          <p className={styles.muted}>Sin resultados.</p>
        ) : null}
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            overflowY: "hidden",
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
            paddingBottom: 6,
            WebkitOverflowScrolling: "touch",
            overscrollBehaviorX: "contain",
          }}
        >
          {hasQuery
            ? results.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  disabled={total >= 60}
                  onClick={() => handleAddCard(card)}
                  title={`${card.name} ${formatCardCode(card)}`}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: total >= 60 ? "not-allowed" : "pointer",
                    opacity: total >= 60 ? 0.5 : 1,
                    flex: "0 0 auto",
                    width: "4.1rem",
                    textAlign: "center",
                  }}
                >
                  <CardImage image={card.image} name={card.name} />
                  <span
                    className={styles.muted}
                    style={{
                      display: "block",
                      fontSize: 9,
                      lineHeight: 1.2,
                      marginTop: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatCardCode(card) || card.name}
                  </span>
                </button>
              ))
            : null}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem 1.25rem",
            marginTop: "0.75rem",
            paddingTop: "0.75rem",
            borderTop: "1px solid var(--border)",
            fontSize: 14,
          }}
        >
          <span>
            Pokémon: <strong>{grouped.totals.pokemon}</strong>
          </span>
          <span>
            Entrenador: <strong>{grouped.totals.trainer}</strong>
          </span>
          <span>
            Energía: <strong>{grouped.totals.energy}</strong>
          </span>
          <span>
            Total:{" "}
            <strong style={{ color: total === 60 ? "var(--ok, #34d399)" : "var(--warn, #fbbf24)" }}>
              {total}
            </strong>
          </span>
          <span className={styles.muted}>{legality.message}</span>
        </div>
      </div>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "0.5rem",
          minHeight: "6rem",
          background: "var(--card)",
        }}
      >
        {slots.length === 0 ? (
          <p className={styles.muted} style={{ textAlign: "center", padding: "1.5rem 0.5rem" }}>
            La lista aparecerá aquí al agregar cartas.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {slots.map((s) => {
              const code = formatCardCode(s);
              const label = code ? `${s.name} (${code})` : s.name;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    className={styles.linkbtn}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "0.45rem 0.5rem" }}
                    onClick={() => setSlots((prev) => removeSlot(prev, s.key))}
                  >
                    {s.qty} {label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <button
          type="button"
          className={styles.btnGhost}
          disabled={slots.length === 0}
          onClick={async () => {
            await navigator.clipboard.writeText(deckSlotsToRawText(slots));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "¡Copiado!" : "Copiar listado"}
        </button>
        <button type="button" className={styles.btnGhost} disabled={slots.length === 0} onClick={() => setSlots([])}>
          Vaciar mazo
        </button>
        <button
          type="button"
          className={styles.btnPrimary}
          style={{ marginLeft: "auto" }}
          disabled={!legality.legal}
          onClick={handleCreateList}
        >
          {applyListLabel}
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {pasteOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
            padding: "1rem",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: "var(--bg, #0f172a)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "1rem",
            }}
          >
            <h3 className={styles.subTitle} style={{ marginTop: 0 }}>
              Importar desde PTCGL
            </h3>
            <textarea
              className={styles.input}
              rows={12}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"Pokémon…\n\nEntrenadores…\n\nEnergías…"}
              style={{ fontFamily: "ui-monospace, monospace", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button type="button" className={styles.btnPrimary} onClick={handlePasteImport}>
                Importar
              </button>
              <button type="button" className={styles.btnGhost} onClick={() => setPasteOpen(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

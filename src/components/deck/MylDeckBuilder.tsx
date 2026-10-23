import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MYL_DECK_SIZE,
  MYL_MAX_COPIES,
  addMylCardToDeck,
  getMylDeckLegality,
  importMylRawTextToSlots,
  mylDeckTotal,
  mylSlotsByType,
  mylSlotsToRawText,
  removeMylSlot,
  type MylDeckSlot,
  type MylTypeFilter,
} from "../../lib/myl/deck-builder";
import { searchMylCardsClient, type MylCardSearchResult } from "../../lib/myl/myl-search";
import styles from "../../screens/pages.module.css";

const TYPE_FILTERS: { id: MylTypeFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "aliado", label: "Aliados" },
  { id: "talisman", label: "Talismanes" },
  { id: "arma", label: "Armas" },
  { id: "totem", label: "Tótems" },
  { id: "oro", label: "Oros" },
  { id: "monumento", label: "Monumentos" },
];

function CardImage({ image, name }: { image?: string; name: string }) {
  const [broken, setBroken] = useState(false);
  if (!image || broken) {
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
      src={image}
      alt={name}
      loading="lazy"
      style={{ width: "3.5rem", height: "4.8rem", objectFit: "cover", borderRadius: 4 }}
      onError={() => setBroken(true)}
    />
  );
}

export function MylDeckBuilder({
  onRawTextReady,
  initialRawText,
  applyListLabel = "Usar esta lista",
}: {
  onRawTextReady?: (rawText: string) => void;
  initialRawText?: string;
  applyListLabel?: string;
}) {
  const [typeFilter, setTypeFilter] = useState<MylTypeFilter>("all");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MylCardSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [slots, setSlots] = useState<MylDeckSlot[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const total = mylDeckTotal(slots);
  const { groups, totals } = useMemo(() => mylSlotsByType(slots), [slots]);
  const legality = useMemo(() => getMylDeckLegality(slots), [slots]);

  const runSearch = useCallback(async () => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    const { cards, error: err } = await searchMylCardsClient({ query, type: typeFilter });
    setResults(cards);
    setSearchError(err || null);
    setSearching(false);
  }, [query, typeFilter]);

  useEffect(() => {
    const t = setTimeout(() => void runSearch(), 320);
    return () => clearTimeout(t);
  }, [runSearch]);

  useEffect(() => {
    if (!initialRawText?.trim()) return;
    const { slots: imported } = importMylRawTextToSlots(initialRawText);
    if (imported.length > 0) setSlots(imported);
  }, [initialRawText]);

  function handleAddCard(card: MylCardSearchResult) {
    if (total >= MYL_DECK_SIZE) return;
    setSlots((prev) => addMylCardToDeck(prev, card));
  }

  function handlePasteImport() {
    const { slots: imported, errors } = importMylRawTextToSlots(pasteText);
    if (errors.length && imported.length === 0) {
      setError(errors.slice(0, 2).join(" "));
      return;
    }
    setSlots(imported);
    setPasteOpen(false);
    setPasteText("");
    setError(errors.length ? errors[0] : null);
  }

  function handleCreateList() {
    if (!legality.legal) {
      setError(legality.errors[0] || `Completa un mazo de ${MYL_DECK_SIZE} cartas.`);
      return;
    }
    onRawTextReady?.(mylSlotsToRawText(slots));
  }

  const hasQuery = query.trim().length >= 2;

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <p className={styles.muted}>
        Busca cartas en el catálogo MyL (api.myl.cl / TOR) o{" "}
        <button type="button" className={styles.linkbtn} onClick={() => setPasteOpen(true)}>
          pega una lista
        </button>
        . Toca un resultado para sumar; toca una fila del mazo para quitar. Máx. {MYL_MAX_COPIES}{" "}
        copias · {MYL_DECK_SIZE} cartas.
      </p>

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

      <label className={styles.label}>
        Buscar carta
        <input
          className={styles.input}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ej. caballero, oro, tótem…"
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
        }}
      >
        {searching && hasQuery ? <p className={styles.muted}>Buscando…</p> : null}
        {hasQuery && !searching && searchError ? <p className={styles.error}>{searchError}</p> : null}
        {hasQuery && !searching && !searchError && results.length === 0 ? (
          <p className={styles.muted}>Sin resultados.</p>
        ) : null}
        {!hasQuery ? <p className={styles.muted}>Escribe al menos 2 letras para buscar.</p> : null}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          {hasQuery
            ? results.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  disabled={total >= MYL_DECK_SIZE}
                  onClick={() => handleAddCard(card)}
                  title={`${card.name} · ${card.typeLabel || card.type}`}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: total >= MYL_DECK_SIZE ? "not-allowed" : "pointer",
                    opacity: total >= MYL_DECK_SIZE ? 0.5 : 1,
                  }}
                >
                  <CardImage image={card.image} name={card.name} />
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
            Total: <strong>{total}</strong>/{MYL_DECK_SIZE}
          </span>
          <span>Aliados: {totals.aliado || 0}</span>
          <span>Talismanes: {totals.talisman || 0}</span>
          <span>Armas: {totals.arma || 0}</span>
          <span>Tótems: {totals.totem || 0}</span>
          <span>Oros: {totals.oro || 0}</span>
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {(
          [
            ["aliado", "Aliados"],
            ["talisman", "Talismanes"],
            ["arma", "Armas"],
            ["totem", "Tótems"],
            ["oro", "Oros"],
            ["monumento", "Monumentos"],
            ["otro", "Otros"],
          ] as const
        ).map(([key, label]) => {
          const list = groups[key] || [];
          if (!list.length) return null;
          return (
            <div key={key}>
              <div className={styles.muted} style={{ fontSize: 12, marginBottom: 4 }}>
                {label} ({totals[key] || 0})
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                {list.map((slot) => (
                  <button
                    key={slot.key}
                    type="button"
                    className={styles.btnGhost}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.65rem",
                      justifyContent: "flex-start",
                      textAlign: "left",
                      padding: "0.35rem 0.5rem",
                    }}
                    onClick={() => setSlots((prev) => removeMylSlot(prev, slot.key))}
                    title="Quitar una copia"
                  >
                    <CardImage image={slot.image} name={slot.name} />
                    <span style={{ flex: 1 }}>
                      <strong>{slot.qty}×</strong> {slot.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {!legality.legal && total > 0 ? (
        <p className={styles.muted} style={{ fontSize: 13 }}>
          {legality.errors[0]}
        </p>
      ) : null}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="button" className={styles.btnPrimary} onClick={handleCreateList} disabled={total === 0}>
          {applyListLabel}
        </button>
        <button
          type="button"
          className={styles.btnGhost}
          onClick={() => {
            setSlots([]);
            setError(null);
          }}
          disabled={total === 0}
        >
          Vaciar
        </button>
      </div>

      {pasteOpen ? (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "0.85rem",
            background: "var(--card)",
            display: "grid",
            gap: "0.65rem",
          }}
        >
          <label className={styles.label}>
            Pegar lista (ej. <code>3x Caballero</code>)
            <textarea
              className={styles.input}
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              style={{ fontFamily: "ui-monospace, monospace" }}
            />
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className={styles.btnPrimary} onClick={handlePasteImport}>
              Importar
            </button>
            <button type="button" className={styles.btnGhost} onClick={() => setPasteOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MYL_DECK_FORMATS,
  MYL_ERAS,
  mylDeckFormatLabel,
  mylEraLabel,
  mylRaceLabel,
  mylRacesForEra,
  normalizeMylDeckFormat,
  normalizeMylEra,
  normalizeMylRace,
} from "../../lib/eventFormats";
import {
  MYL_DECK_SIZE,
  MYL_MAX_COPIES,
  MYL_MIN_ALLIES_RACIAL,
  addMylCardToDeck,
  getMylDeckLegality,
  importMylRawTextToSlots,
  mylDeckTotal,
  needsRaceForConstruction,
  mylSlotsByType,
  mylSlotsToRawText,
  removeMylSlot,
  type MylDeckConstruction,
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
  era,
  race,
  deckFormat,
  onEraRaceChange,
}: {
  onRawTextReady?: (rawText: string) => void;
  initialRawText?: string;
  applyListLabel?: string;
  era?: string;
  race?: string;
  deckFormat?: string;
  onEraRaceChange?: (next: { era: string; race: string; deckFormat: string }) => void;
}) {
  const [eraLocal, setEraLocal] = useState(() => normalizeMylEra(era) || "");
  const [raceLocal, setRaceLocal] = useState(() => normalizeMylRace(race, era) || "");
  const [deckFormatLocal, setDeckFormatLocal] = useState<MylDeckConstruction>(
    () => (normalizeMylDeckFormat(deckFormat) || "soporte-libre") as MylDeckConstruction
  );
  const [typeFilter, setTypeFilter] = useState<MylTypeFilter>("all");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MylCardSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [slots, setSlots] = useState<MylDeckSlot[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Evita que una búsqueda vieja pise resultados frescos (cat típico: cards → “sin resultados”). */
  const searchGen = useRef(0);

  useEffect(() => {
    const e = normalizeMylEra(era);
    if (e && e !== eraLocal) setEraLocal(e);
  }, [era]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const r = normalizeMylRace(race, eraLocal || era);
    if (r && r !== raceLocal) setRaceLocal(r);
  }, [race, eraLocal, era]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const f = (normalizeMylDeckFormat(deckFormat) || "soporte-libre") as MylDeckConstruction;
    if (f !== deckFormatLocal) setDeckFormatLocal(f);
  }, [deckFormat]); // eslint-disable-line react-hooks/exhaustive-deps

  const [raceMeta, setRaceMeta] = useState<Record<string, { hint: string; homeLabel: string }>>({});
  const races = useMemo(() => mylRacesForEra(eraLocal || undefined), [eraLocal]);
  const needsRace = needsRaceForConstruction(deckFormatLocal);
  const setupReady = Boolean(eraLocal && (!needsRace || raceLocal));
  const activeMeta = raceLocal ? raceMeta[raceLocal] : null;
  const constructionHint =
    MYL_DECK_FORMATS.find((f) => f.slug === deckFormatLocal)?.hint || "";

  useEffect(() => {
    if (!eraLocal) {
      setRaceMeta({});
      return;
    }
    let alive = true;
    fetch(`/api/store/myl/meta?era=${encodeURIComponent(eraLocal)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j?.ok || !Array.isArray(j.races)) return;
        const map: Record<string, { hint: string; homeLabel: string }> = {};
        for (const row of j.races) {
          if (!row?.slug) continue;
          map[String(row.slug)] = {
            hint: String(row.hint || ""),
            homeLabel: String(row.homeLabel || ""),
          };
        }
        setRaceMeta(map);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      alive = false;
    };
  }, [eraLocal]);

  const total = mylDeckTotal(slots);
  const { groups, totals } = useMemo(() => mylSlotsByType(slots), [slots]);
  const legality = useMemo(
    () => getMylDeckLegality(slots, { deckFormat: deckFormatLocal }),
    [slots, deckFormatLocal]
  );

  function emitChange(next: { era: string; race: string; deckFormat: string }) {
    onEraRaceChange?.(next);
  }

  function setEra(next: string) {
    const e = normalizeMylEra(next);
    setEraLocal(e);
    const stillValid = normalizeMylRace(raceLocal, e);
    const r = stillValid || "";
    setRaceLocal(r);
    emitChange({ era: e, race: r, deckFormat: deckFormatLocal });
  }

  function setRace(next: string) {
    const r = normalizeMylRace(next, eraLocal);
    setRaceLocal(r);
    emitChange({ era: eraLocal, race: r, deckFormat: deckFormatLocal });
  }

  function setConstruction(next: string) {
    const f = (normalizeMylDeckFormat(next) || "soporte-libre") as MylDeckConstruction;
    setDeckFormatLocal(f);
    emitChange({ era: eraLocal, race: raceLocal, deckFormat: f });
  }

  const runSearch = useCallback(async () => {
    if (!eraLocal || (needsRace && !raceLocal)) {
      searchGen.current += 1;
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    const q = query.trim();
    // Mientras escribís la 1ª letra no vaciamos: esperamos 2 chars o query vacío (catálogo).
    if (q.length === 1) return;

    const gen = ++searchGen.current;
    setSearching(true);
    setSearchError(null);
    const { cards, error: err } = await searchMylCardsClient({
      query: q,
      type: typeFilter,
      era: eraLocal,
      race: raceLocal,
      deckFormat: deckFormatLocal,
    });
    // Respuesta vieja: no pisar ni tocar searching (la búsqueda nueva lo maneja).
    if (gen !== searchGen.current) return;
    setResults(cards);
    setSearchError(err || null);
    setSearching(false);
  }, [query, typeFilter, eraLocal, raceLocal, deckFormatLocal, needsRace]);

  useEffect(() => {
    if (!setupReady) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    const t = setTimeout(() => void runSearch(), 320);
    return () => clearTimeout(t);
  }, [runSearch, setupReady]);

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
    if (!setupReady) {
      setError(
        needsRace
          ? "Elige era, construcción y raza antes de guardar la lista."
          : "Elige era y construcción antes de guardar la lista."
      );
      return;
    }
    if (!legality.legal) {
      setError(legality.errors[0] || `Completa un mazo de ${MYL_DECK_SIZE} cartas.`);
      return;
    }
    onRawTextReady?.(mylSlotsToRawText(slots));
  }

  const allyProgress =
    legality.minAllies > 0
      ? `${totals.aliado || 0}/${legality.minAllies}`
      : String(totals.aliado || 0);

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "0.85rem",
          background: "var(--card)",
          display: "grid",
          gap: "0.75rem",
        }}
      >
        <div>
          <span className={styles.muted} style={{ display: "block", marginBottom: 4, fontSize: 12 }}>
            Era / bloque
          </span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {MYL_ERAS.map((e) => (
              <button
                key={e.slug}
                type="button"
                className={eraLocal === e.slug ? styles.btnPrimary : styles.btnGhost}
                style={{ padding: "0.35rem 0.65rem", fontSize: 12 }}
                onClick={() => setEra(e.slug)}
              >
                {e.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={styles.muted} style={{ display: "block", marginBottom: 4, fontSize: 12 }}>
            Construcción del mazo
          </span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {MYL_DECK_FORMATS.map((f) => (
              <button
                key={f.slug}
                type="button"
                className={deckFormatLocal === f.slug ? styles.btnPrimary : styles.btnGhost}
                style={{ padding: "0.35rem 0.65rem", fontSize: 12 }}
                onClick={() => setConstruction(f.slug)}
                title={f.hint}
              >
                {f.name}
              </button>
            ))}
          </div>
          {constructionHint ? (
            <p className={styles.muted} style={{ margin: "0.4rem 0 0", fontSize: 12 }}>
              {constructionHint}
            </p>
          ) : null}
        </div>

        {needsRace ? (
          <label className={styles.label}>
            Raza
            <select
              className={styles.input}
              value={raceLocal}
              disabled={!eraLocal}
              onChange={(e) => setRace(e.target.value)}
            >
              <option value="">{eraLocal ? "Elige una raza…" : "Primero elige era"}</option>
              {races.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className={styles.label}>
            Raza (opcional, para filtrar)
            <select
              className={styles.input}
              value={raceLocal}
              disabled={!eraLocal}
              onChange={(e) => setRace(e.target.value)}
            >
              <option value="">Todas las razas</option>
              {races.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {setupReady ? (
          <p className={styles.muted} style={{ margin: 0, fontSize: 13 }}>
            <strong>{mylEraLabel(eraLocal)}</strong>
            {" · "}
            <strong>{mylDeckFormatLabel(deckFormatLocal)}</strong>
            {raceLocal ? (
              <>
                {" · "}
                <strong>{mylRaceLabel(raceLocal, eraLocal)}</strong>
              </>
            ) : null}
            {activeMeta?.homeLabel && deckFormatLocal === "racial" ? (
              <> — hogar: {activeMeta.homeLabel}</>
            ) : null}
            {activeMeta?.hint ? <> — {activeMeta.hint}</> : null}
          </p>
        ) : (
          <p className={styles.muted} style={{ margin: 0, fontSize: 13 }}>
            Elige era y construcción
            {needsRace ? " (y raza)" : ""}. En TOR, Goblin no es raza propia (Faerie + nombre Goblin…);
            Hobglobin no cuenta; Minotauro suele ser Titán; Druida suele ser Defensor.
          </p>
        )}
      </div>

      {!setupReady ? null : (
        <>
          <p className={styles.muted}>
            Busca por nombre o deja vacío para ver el catálogo filtrado. También puedes{" "}
            <button type="button" className={styles.linkbtn} onClick={() => setPasteOpen(true)}>
              pegar una lista
            </button>
            . Máx. {MYL_MAX_COPIES} copias · {MYL_DECK_SIZE} cartas
            {needsRace ? ` · mín. ${MYL_MIN_ALLIES_RACIAL} Aliados` : ""}.
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
            Buscar carta (opcional)
            <input
              className={styles.input}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtra por nombre… o déjalo vacío"
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
            {searching && results.length === 0 ? <p className={styles.muted}>Buscando…</p> : null}
            {searching && results.length > 0 ? (
              <p className={styles.muted} style={{ fontSize: 12 }}>
                Actualizando…
              </p>
            ) : null}
            {!searching && searchError ? <p className={styles.error}>{searchError}</p> : null}
            {!searching && !searchError && results.length === 0 ? (
              <p className={styles.muted}>Sin resultados para este filtro.</p>
            ) : null}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
              {results.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  disabled={total >= MYL_DECK_SIZE}
                  onClick={() => handleAddCard(card)}
                  title={`${card.name} · ${card.typeLabel || card.type} · ${card.editionSlug || ""}`}
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
              ))}
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
              <span>
                Aliados: <strong>{allyProgress}</strong>
              </span>
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
                          {slot.qty >= MYL_MAX_COPIES ? (
                            <span className={styles.muted} style={{ marginLeft: 6, fontSize: 11 }}>
                              máx.
                            </span>
                          ) : null}
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
            <ul className={styles.muted} style={{ margin: 0, paddingLeft: "1.1rem", fontSize: 13 }}>
              {legality.errors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          ) : null}
          {legality.legal && legality.warnings.length ? (
            <p className={styles.muted} style={{ fontSize: 13 }}>
              {legality.warnings[0]}
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
                Pegar lista (ej. <code>3x Goblin</code>)
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
        </>
      )}
    </div>
  );
}

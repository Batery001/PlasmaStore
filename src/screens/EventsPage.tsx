import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatCLP } from "../lib/money";
import { resolveStoreMediaUrl } from "../lib/media";
import { parseResponseJson } from "../lib/parseResponseJson";
import { useAuth } from "../auth/AuthContext";
import { notifyCartChanged } from "../lib/cartEvents";
import { EVENT_GAME_TAGS, eventGameTagLabel, normalizeEventGameTag } from "../lib/eventGameTags";
import { mylEventSummary, pokemonFormatLabel } from "../lib/eventFormats";
import styles from "./pages.module.css";

type EventItem = {
  id: number;
  product_id?: number | null;
  title: string;
  game_tag?: string;
  game_tag_label?: string;
  pokemon_format?: string;
  pokemon_format_label?: string;
  myl_era?: string;
  myl_event_type?: string;
  myl_deck_format?: string;
  myl_era_label?: string;
  myl_event_type_label?: string;
  myl_deck_format_label?: string;
  starts_at?: string;
  date_label?: string;
  place?: string;
  description?: string;
  image_url?: string;
  link?: string;
  registration_enabled?: boolean;
  capacity?: number;
  price_cents?: number;
  terms_text?: string;
  remaining?: number | null;
  sold_out?: boolean;
  started?: boolean;
  taken?: number;
};

type EventsBlock = {
  enabled?: boolean;
  title?: string;
  subtitle?: string;
  items?: EventItem[];
};

export function EventsPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventsBlock | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [gameFilter, setGameFilter] = useState<string>("");

  async function reload() {
    const r = await fetch("/api/store/site-content");
    const j = await parseResponseJson<{ ok?: boolean; content?: { events?: EventsBlock }; error?: string }>(r);
    if (!r.ok || !j?.ok) throw new Error(j?.error || "No se pudo cargar.");
    setEvents(j.content?.events || null);
  }

  useEffect(() => {
    let alive = true;
    reload().catch((e) => {
      if (alive) setErr(e instanceof Error ? e.message : "Error");
    });
    return () => {
      alive = false;
    };
  }, []);

  const items = (events?.items || []).filter((it) => {
    if (!it.title) return false;
    if (!gameFilter) return true;
    return normalizeEventGameTag(it.game_tag) === gameFilter;
  });
  const selected = items.find((it) => it.id === selectedId) || null;

  useEffect(() => {
    setMsg(null);
  }, [selectedId]);

  async function addToCart(goToCart: boolean) {
    if (!selected) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (!user) {
        setMsg("Inicia sesión para agregar el cupo al carrito.");
        return;
      }
      const productId = parseInt(String(selected.product_id || ""), 10);
      if (!Number.isFinite(productId) || productId < 1) {
        throw new Error("Este evento aún no tiene cupo para vender. Guárdalo de nuevo en Admin → Eventos.");
      }
      const res = await fetch("/api/store/cart", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      const data = await parseResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "No se pudo agregar al carrito.");
      notifyCartChanged();
      if (goToCart) {
        window.location.href = "/carrito";
        return;
      }
      setMsg("Cupo agregado al carrito. Sigue el pago como un producto.");
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (events && !events.enabled) {
    return (
      <div>
        <p className={styles.muted}>
          Los eventos están desactivados por ahora. <Link to="/">Volver al inicio</Link>
        </p>
      </div>
    );
  }

  const selectedImg = selected ? resolveStoreMediaUrl(selected.image_url) : undefined;
  const canBuy =
    Boolean(selected?.registration_enabled) && !selected?.sold_out && !selected?.started && Boolean(selected?.product_id);

  return (
    <div>
      <section className={styles.storeIntro}>
        <div className={styles.storeIntroTop}>
          <div>
            <p className={styles.kicker}>Agenda</p>
            <h1 className={styles.storeIntroTitle}>{events?.title || "Eventos"}</h1>
          </div>
        </div>
        <p className={styles.muted} style={{ margin: 0 }}>
          {events?.subtitle || "Torneos, lanzamientos y encuentros."}
        </p>
      </section>

      {err ? <p className={styles.error}>{err}</p> : null}
      {msg ? <p className={styles.banner}>{msg}</p> : null}
      {!events && !err ? <p className={styles.muted}>Cargando…</p> : null}

      {selected ? (
        <div className={styles.detailWrap} style={{ marginTop: "0.5rem" }}>
          <div className={styles.detailGrid}>
            <div className={styles.detailLeft}>
              <div className={styles.detailImageFrame} aria-hidden>
                {selectedImg ? (
                  <img className={styles.detailImage} src={selectedImg} alt="" />
                ) : (
                  <span className={styles.detailGlyph}>★</span>
                )}
              </div>
            </div>
            <div className={styles.detailRight}>
              <h1 className={styles.detailTitle}>{selected.title}</h1>
              {eventGameTagLabel(selected.game_tag) || selected.game_tag_label ? (
                <p className={styles.kicker}>
                  {selected.game_tag_label || eventGameTagLabel(selected.game_tag)}
                  {selected.pokemon_format_label || pokemonFormatLabel(selected.pokemon_format)
                    ? ` · ${selected.pokemon_format_label || pokemonFormatLabel(selected.pokemon_format)}`
                    : ""}
                  {mylEventSummary(selected) ? ` · ${mylEventSummary(selected)}` : ""}
                </p>
              ) : null}
              <div className={styles.detailPriceSolo}>{formatCLP(selected.price_cents || 0)}</div>
              <div className={styles.muted}>
                {[selected.date_label, selected.place].filter(Boolean).join(" · ")}
                {typeof selected.remaining === "number" ? ` · quedan ${selected.remaining} cupos` : null}
              </div>
              {selected.description ? (
                <div className={styles.detailDescBlock}>
                  <div className={styles.detailDescTitle}>Descripción</div>
                  <div className={styles.detailDesc}>{selected.description}</div>
                </div>
              ) : null}

              {selected.registration_enabled && selected.started ? (
                <p className={styles.muted}>
                  El evento ya comenzó. Los cupos que no estaban pagados se liberaron.
                </p>
              ) : canBuy ? (
                <>
                  <p className={styles.muted}>
                    Un cupo por persona. Después del pago vas a completar POPID o CL y, en MyL, tu raza
                    {normalizeEventGameTag(selected.game_tag) === "pokemon" &&
                    (selected.pokemon_format === "challenge" || selected.pokemon_format === "cup")
                      ? " y la lista de mazo"
                      : ""}
                    , hasta 24 horas antes del inicio (si compras más tarde, antes de que empiece). El cupo no se
                    transfiere: puedes cancelar solo dentro del plazo de arrepentimiento.
                  </p>
                  {selected.terms_text ? (
                    <div
                      style={{
                        maxHeight: 140,
                        overflow: "auto",
                        padding: "0.75rem",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                        whiteSpace: "pre-wrap",
                        fontSize: "0.88rem",
                        color: "var(--muted)",
                        marginBottom: "0.75rem",
                      }}
                    >
                      {selected.terms_text}
                    </div>
                  ) : null}
                  <div className={styles.detailActions}>
                    <button
                      type="button"
                      className={styles.detailBtnLight}
                      disabled={busy}
                      onClick={() => void addToCart(false)}
                    >
                      {busy ? "Agregando…" : "Agregar al carrito"}
                    </button>
                    <button
                      type="button"
                      className={styles.detailBtnDark}
                      disabled={busy}
                      onClick={() => void addToCart(true)}
                    >
                      Comprar ahora
                    </button>
                    <button type="button" className={styles.detailBtnLight} onClick={() => setSelectedId(null)}>
                      Volver
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.detailActions}>
                  {selected.link ? (
                    <a href={selected.link} target="_blank" rel="noreferrer" className={styles.detailBtnDark}>
                      Más info
                    </a>
                  ) : null}
                  <button type="button" className={styles.detailBtnLight} onClick={() => setSelectedId(null)}>
                    Volver
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : events?.enabled && ((events.items || []).some((it) => it.title) || items.length > 0) ? (
        <section className={styles.catalogSection}>
          <h2 className={styles.sectionTitle}>Próximos eventos</h2>
          <div className={styles.eventTagFilters} role="tablist" aria-label="Filtrar torneos">
            <button
              type="button"
              className={`${styles.eventTagChip} ${!gameFilter ? styles.eventTagChipOn : ""}`}
              onClick={() => setGameFilter("")}
            >
              Todos
            </button>
            {EVENT_GAME_TAGS.map((t) => (
              <button
                key={t.slug}
                type="button"
                className={`${styles.eventTagChip} ${gameFilter === t.slug ? styles.eventTagChipOn : ""}`}
                onClick={() => setGameFilter(t.slug)}
              >
                {t.name}
              </button>
            ))}
          </div>
          {items.length === 0 ? (
            <p className={styles.muted}>No hay torneos con esa etiqueta por ahora.</p>
          ) : null}
          <div className={styles.grid}>
            {items.map((it) => {
              const cover = resolveStoreMediaUrl(it.image_url);
              const cups =
                typeof it.remaining === "number"
                  ? it.sold_out
                    ? "Agotado"
                    : `${it.remaining} cupo${it.remaining === 1 ? "" : "s"}`
                  : it.capacity
                    ? `${it.capacity} cupos`
                    : "Cupos";
              return (
                <article key={it.id} className={styles.card}>
                  <div className={`${styles.cardThumb} ${styles.eventCardThumb}`} aria-hidden>
                    <button
                      type="button"
                      className={styles.cardLinkCover}
                      aria-label={`Ver ${it.title}`}
                      onClick={() => setSelectedId(it.id)}
                    />
                    {cover ? (
                      <img className={styles.cardImage} src={cover} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span>★</span>
                    )}
                  </div>
                  <button type="button" className={styles.cardTitleLink} onClick={() => setSelectedId(it.id)}>
                    <h3 className={styles.cardTitle}>{it.title}</h3>
                  </button>
                  {eventGameTagLabel(it.game_tag) || it.game_tag_label ? (
                    <p className={styles.kicker} style={{ margin: "0.15rem 0 0" }}>
                      {it.game_tag_label || eventGameTagLabel(it.game_tag)}
                      {mylEventSummary(it) ? ` · ${mylEventSummary(it)}` : ""}
                    </p>
                  ) : null}
                  <p className={styles.cardDesc}>
                    {[it.date_label, it.place].filter(Boolean).join(" · ") || it.description || "Evento Plasma Store"}
                  </p>
                  <div className={styles.priceRow}>
                    <span className={styles.price}>
                      {it.registration_enabled ? formatCLP(it.price_cents || 0) : "Gratis"}
                    </span>
                    <span className={styles.stock}>{it.registration_enabled ? cups : "Informativo"}</span>
                  </div>
                  {it.registration_enabled ? (
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      disabled={Boolean(it.sold_out) || Boolean(it.started)}
                      onClick={() => setSelectedId(it.id)}
                    >
                      {it.started ? "Ya comenzó" : it.sold_out ? "Agotado" : "Ver / agregar al carrito"}
                    </button>
                  ) : it.link ? (
                    <a href={it.link} target="_blank" rel="noreferrer" className={styles.btnPrimary}>
                      Más info
                    </a>
                  ) : (
                    <button type="button" className={styles.btnPrimary} onClick={() => setSelectedId(it.id)}>
                      Ver detalle
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ) : events?.enabled ? (
        <p className={styles.muted}>Pronto publicaremos los próximos eventos.</p>
      ) : null}
    </div>
  );
}

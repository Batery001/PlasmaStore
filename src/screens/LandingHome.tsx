import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { resolveStoreMediaUrl } from "../lib/media";
import { formatCLP } from "../lib/money";
import styles from "./landing.module.css";

/** Posiciones % para partículas estrella (fondo cósmico) — pocas para no saturar GPU. */
const STARFIELD = [
  [6, 10, "0s"],
  [22, 16, "0.8s"],
  [52, 12, "0.2s"],
  [88, 14, "0.6s"],
  [30, 22, "2s"],
  [85, 32, "1.6s"],
  [8, 38, "1.8s"],
  [72, 38, "2.1s"],
] as const;

/** Partículas mágicas más finas que las estrellas. */
const DUST = [
  [11, 18, "0.1s"],
  [41, 24, "1.4s"],
  [76, 31, "2s"],
  [54, 42, "0.5s"],
] as const;

type SiteContent = {
  singles_enabled?: boolean;
  socials?: Record<string, { enabled?: boolean; url?: string }>;
  about?: { enabled?: boolean; title?: string; body?: string };
  home_cards?: { sealed_image_url?: string; events_image_url?: string };
  events?: {
    enabled?: boolean;
    title?: string;
    subtitle?: string;
    items?: Array<{
      id: number;
      title: string;
      date_label?: string;
      place?: string;
      description?: string;
    }>;
  };
};

const SOCIAL_GLYPH: Record<string, string> = {
  facebook: "f",
  instagram: "ig",
  youtube: "yt",
  whatsapp: "wa",
};

/**
 * Inicio premium: vacío eléctrico, plasma, tarjetas flotantes, vitrina cristal (brief visual).
 */
export function LandingHome() {
  const [sealed, setSealed] = useState<
    Array<{
      id: number;
      name: string;
      description?: string;
      price_cents: number;
      compare_price_cents?: number | null;
      stock: number;
      image_url?: string | null;
      tags?: string[];
    }>
  >([]);
  const [sealIdx, setSealIdx] = useState(0);
  const [site, setSite] = useState<SiteContent | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/store/products?limit=10")
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (!ok || !j?.ok) return;
        const list = Array.isArray(j.products) ? j.products : [];
        const filtered = list.filter(
          (p: (typeof list)[number]) => !(Array.isArray(p?.tags) && p.tags.includes("singles"))
        );
        setSealed(filtered);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/store/site-content")
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive || !ok || !j?.ok) return;
        setSite(j.content || null);
      })
      .catch(() => {
        /* defaults */
      });
    return () => {
      alive = false;
    };
  }, []);

  const activeSocials = Object.entries(site?.socials || {}).filter(([, v]) => v?.enabled && v?.url);
  const eventsOn = site?.events?.enabled !== false;
  const featuredEvent = (site?.events?.items || []).find((e) => e.title) || null;

  return (
    <div className={styles.root}>
      <div className={styles.panelPhotoBg} aria-hidden />
      <div className={styles.bgGrid} aria-hidden />
      <div className={styles.cosmicSwirl} aria-hidden />
      <div className={styles.fxLayer} aria-hidden>
        <span className={styles.bolt} />
        <span className={styles.bolt2} />
        <span className={styles.bolt3} />
        <span className={styles.bolt4} />
        <span className={styles.bolt5} />
        <span className={styles.ghostCard} />
        <span className={styles.ghostCard2} />
        <span className={`${styles.ghostCard} ${styles.ghostCard3}`} />
        <span className={`${styles.ghostCard} ${styles.ghostCard4}`} />
      </div>
      <div className={styles.starfield} aria-hidden>
        {STARFIELD.map(([l, t, d], i) => (
          <span key={i} className={styles.star} style={{ left: `${l}%`, top: `${t}%`, animationDelay: d }} />
        ))}
        {DUST.map(([l, t, d], i) => (
          <span key={`d${i}`} className={styles.dust} style={{ left: `${l}%`, top: `${t}%`, animationDelay: d }} />
        ))}
      </div>

      <section className={styles.heroStage}>
        <div className={styles.welcomeGlass}>
          <div className={styles.welcomeTextBlock}>
            <p className={styles.welcomeKicker}>BIENVENIDO A</p>
            <h1 className={styles.welcomeTitle}>
              <span className={styles.welcomePlasma}>Plasma</span> <span className={styles.welcomeStore}>Store</span>
            </h1>
          </div>
          <div className={styles.welcomeRule} aria-hidden />
          <div className={styles.mascotRow}>
            <div className={styles.mascotWrap}>
              <div className={styles.mascotOuter}>
                <img
                  src="/mascot-hero.webp"
                  srcSet="/mascot-hero-sm.webp 480w, /mascot-hero.webp 720w"
                  sizes="(max-width: 640px) 90vw, 680px"
                  alt="Mascota de Plasma Store"
                  className={styles.mascot}
                  width={680}
                  height={856}
                  decoding="async"
                  fetchPriority="high"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className={styles.showcase}>
        <div className={styles.featureGrid}>
          <a href="/catalogo" className={`${styles.card} ${styles.cardHero}`}>
            {resolveStoreMediaUrl(site?.home_cards?.sealed_image_url) ? (
              <div className={styles.cardHeroPhoto}>
                <img src={resolveStoreMediaUrl(site?.home_cards?.sealed_image_url)} alt="" />
              </div>
            ) : (
              <div className={styles.tarotStack} aria-hidden>
                <span className={styles.tarotCard} />
                <span className={styles.tarotCard} />
                <span className={styles.tarotCard} />
              </div>
            )}
            <h3 className={styles.cardTitle}>Sellado</h3>
            <p className={styles.cardHint}>Productos sellados — disponibles en catálogo.</p>
          </a>
          {eventsOn ? (
            <Link to="/eventos" className={`${styles.card} ${styles.cardHero}`}>
              {resolveStoreMediaUrl(site?.home_cards?.events_image_url) ? (
                <div className={styles.cardHeroPhoto}>
                  <img src={resolveStoreMediaUrl(site?.home_cards?.events_image_url)} alt="" />
                </div>
              ) : (
                <div className={styles.cardVisualStar} aria-hidden />
              )}
              <h3 className={styles.cardTitle}>{site?.events?.title || "Eventos"}</h3>
              <p className={styles.cardHint}>
                {featuredEvent
                  ? `${featuredEvent.title}${featuredEvent.date_label ? ` · ${featuredEvent.date_label}` : ""}`
                  : site?.events?.subtitle || "Torneos, lanzamientos y encuentros."}
              </p>
            </Link>
          ) : site?.singles_enabled ? (
            <a href="/singles" className={`${styles.card} ${styles.cardHero}`}>
              <div className={styles.cardVisualStar} aria-hidden />
              <h3 className={styles.cardTitle}>Single</h3>
              <p className={styles.cardHint}>Cartas sueltas — disponibles en catálogo.</p>
            </a>
          ) : (
            <a href="/catalogo" className={`${styles.card} ${styles.cardHero}`}>
              <div className={styles.cardVisualStar} aria-hidden />
              <h3 className={styles.cardTitle}>Catálogo</h3>
              <p className={styles.cardHint}>Explora todo lo disponible en la tienda.</p>
            </a>
          )}
        </div>
        <div className={styles.featureRow4}>
          <section className={styles.sealedSection} aria-label="Sellados destacados">
            <div className={styles.sealedHead}>
              <div>
                <h2 className={styles.sealedTitle}>Sellados destacados</h2>
                <p className={styles.sealedLead}>Carrusel automático con productos disponibles.</p>
              </div>
              <div className={styles.sealedControls}>
                <button
                  type="button"
                  className={styles.sealedArrow}
                  onClick={() => setSealIdx((i) => Math.max(0, i - 1))}
                  disabled={sealIdx <= 0}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className={styles.sealedArrow}
                  onClick={() => setSealIdx((i) => Math.min(Math.max(0, sealed.length - 1), i + 1))}
                  disabled={sealIdx >= sealed.length - 1}
                >
                  ›
                </button>
              </div>
            </div>

            {sealed.length === 0 ? (
              <div className={styles.sealedEmpty}>No hay productos aún.</div>
            ) : (
              <div className={styles.sealedViewport}>
                <div
                  className={styles.sealedTrack}
                  style={{ transform: `translateX(calc(-${sealIdx} * (320px + 14px)))` }}
                >
                  {sealed.map((p) => (
                    <Link key={p.id} to="/catalogo" className={styles.sealedCard}>
                      <div className={styles.sealedThumb} aria-hidden>
                        {typeof p.compare_price_cents === "number" && p.compare_price_cents > p.price_cents ? (
                          <span className={styles.sealedBadge}>Oferta</span>
                        ) : null}
                        {resolveStoreMediaUrl(p.image_url) ? (
                          <img
                            className={styles.sealedImg}
                            src={resolveStoreMediaUrl(p.image_url)}
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span className={styles.sealedGlyph}>🎴</span>
                        )}
                      </div>
                      <div className={styles.sealedBody}>
                        <div className={styles.sealedName}>{p.name}</div>
                        {typeof p.compare_price_cents === "number" && p.compare_price_cents > p.price_cents ? (
                          <div className={styles.sealedMeta}>
                            <div className={styles.sealedPriceRow}>
                              <span className={styles.sealedPriceOld}>{formatCLP(p.compare_price_cents)}</span>
                              <span className={styles.sealedPriceNew}>{formatCLP(p.price_cents)}</span>
                            </div>
                            <span className={styles.sealedStock}>Stock: {p.stock}</span>
                          </div>
                        ) : (
                          <div className={styles.sealedMeta}>
                            <span className={styles.sealedPrice}>{formatCLP(p.price_cents)}</span>
                            <span className={styles.sealedStock}>Stock: {p.stock}</span>
                          </div>
                        )}
                        <div className={styles.sealedActions} aria-hidden>
                          <span className={styles.sealedBtn}>Agregar al carrito</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {activeSocials.length > 0 ? (
        <div className={styles.socialBand}>
          <div className={styles.socialRow} aria-label="Redes sociales">
            {activeSocials.map(([key, row]) => (
              <a
                key={key}
                href={row.url}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={key}
                title={key}
              >
                {SOCIAL_GLYPH[key] || key.slice(0, 2)}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

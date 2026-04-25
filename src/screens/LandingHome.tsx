import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { resolveStoreMediaUrl } from "../lib/media";
import { formatCLP } from "../lib/money";
import styles from "./landing.module.css";

/** Posiciones % para partículas estrella (fondo cósmico). */
const STARFIELD = [
  [6, 10, "0s"],
  [14, 6, "0.4s"],
  [22, 16, "0.8s"],
  [38, 5, "1.1s"],
  [52, 12, "0.2s"],
  [68, 8, "1.4s"],
  [88, 14, "0.6s"],
  [94, 22, "1.9s"],
  [78, 28, "0.3s"],
  [12, 26, "1.2s"],
  [30, 22, "2s"],
  [58, 20, "0.9s"],
  [85, 32, "1.6s"],
  [44, 14, "0.5s"],
  [8, 38, "1.8s"],
  [91, 8, "0.7s"],
  [55, 34, "1.3s"],
  [72, 38, "2.1s"],
] as const;

/** Partículas mágicas más finas que las estrellas. */
const DUST = [
  [11, 18, "0.1s"],
  [27, 9, "0.7s"],
  [41, 24, "1.4s"],
  [63, 14, "0.3s"],
  [76, 31, "2s"],
  [89, 19, "0.9s"],
  [18, 44, "1.1s"],
  [54, 42, "0.5s"],
  [33, 7, "1.8s"],
  [71, 11, "0.2s"],
] as const;

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

  useEffect(() => {
    let alive = true;
    fetch("/api/store/products?limit=10")
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (!ok || !j?.ok) return;
        const list = Array.isArray(j.products) ? j.products : [];
        // No mezclar singles en el carrusel principal (solo catálogo "sellado"/general)
        const filtered = list.filter((p: (typeof list)[number]) => !(Array.isArray(p?.tags) && p.tags.includes("singles")));
        setSealed(filtered);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      alive = false;
    };
  }, []);

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
                  src="/mascot-hero.png"
                  alt="Mascota de Plasma Store"
                  className={styles.mascot}
                  width={420}
                  height={420}
                  decoding="async"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className={styles.showcase}>
        <div className={styles.featureGrid}>
          <a href="/catalogo" className={`${styles.card} ${styles.cardHero}`}>
            <div className={styles.tarotStack} aria-hidden>
              <span className={styles.tarotCard} />
              <span className={styles.tarotCard} />
              <span className={styles.tarotCard} />
            </div>
            <h3 className={styles.cardTitle}>Sellado</h3>
            <p className={styles.cardHint}>Productos sellados — disponibles en catálogo.</p>
          </a>
          <a href="/singles" className={`${styles.card} ${styles.cardHero}`}>
            <div className={styles.cardVisualStar} aria-hidden />
            <h3 className={styles.cardTitle}>Single</h3>
            <p className={styles.cardHint}>Cartas sueltas — disponibles en catálogo.</p>
          </a>
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
              <div className={styles.sealedEmpty}>
                No hay productos aún.
              </div>
            ) : (
              <div className={styles.sealedViewport}>
                <div className={styles.sealedTrack} style={{ transform: `translateX(calc(-${sealIdx} * (320px + 14px)))` }}>
                  {sealed.map((p) => (
                    <Link key={p.id} to="/catalogo" className={styles.sealedCard}>
                      <div className={styles.sealedThumb} aria-hidden>
                        {typeof p.compare_price_cents === "number" && p.compare_price_cents > p.price_cents ? (
                          <span className={styles.sealedBadge}>Oferta</span>
                        ) : null}
                        {resolveStoreMediaUrl(p.image_url) ? (
                          <img className={styles.sealedImg} src={resolveStoreMediaUrl(p.image_url)} alt="" />
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

      <div className={styles.socialBand}>
        <div className={styles.socialRow} aria-label="Redes sociales">
          <a href="https://facebook.com" target="_blank" rel="noreferrer noopener" aria-label="Facebook">
            f
          </a>
          <a href="https://twitter.com" target="_blank" rel="noreferrer noopener" aria-label="X">
            𝕏
          </a>
          <a href="https://instagram.com" target="_blank" rel="noreferrer noopener" aria-label="Instagram">
            in
          </a>
        </div>
      </div>
    </div>
  );
}

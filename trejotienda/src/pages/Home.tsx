import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { resolveStoreMediaUrl } from "../lib/media";
import { parseResponseJson } from "../lib/parseResponseJson";
import { formatCLP } from "../lib/money";
import { useAuth } from "../auth/AuthContext";
import styles from "./pages.module.css";

type Product = {
  id: number;
  name: string;
  description: string;
  price_cents: number;
  stock: number;
  image_url?: string | null;
};

const CAROUSEL_MAX = 6;

/** Inicio = catálogo: carrusel de destacados + rejilla completa. */
export function Home() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [carouselEnabled, setCarouselEnabled] = useState(true);
  const [carouselAutoMs, setCarouselAutoMs] = useState(6000);
  const [msg, setMsg] = useState<string | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/store/products")
      .then(async (r) => parseResponseJson<{ products?: Product[] }>(r))
      .then((d) => setProducts(d.products || []))
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    fetch("/api/store/carousel")
      .then(async (r) => parseResponseJson<{ products?: Product[]; enabled?: boolean; autoMs?: number }>(r))
      .then((d) => {
        setFeatured(d.products || []);
        setCarouselEnabled(d.enabled !== false);
        const am = typeof d.autoMs === "number" && Number.isFinite(d.autoMs) ? d.autoMs : 6000;
        setCarouselAutoMs(am);
      })
      .catch(() => {
        setFeatured([]);
        setCarouselEnabled(true);
        setCarouselAutoMs(6000);
      });
  }, []);

  /** Lista del carrusel: manual (widgets) o, si no hay, los primeros del catálogo como siempre. */
  const displayFeatured = useMemo(() => {
    if (featured.length > 0) return featured;
    return products.slice(0, Math.min(CAROUSEL_MAX, products.length));
  }, [featured, products]);

  useEffect(() => {
    setCarouselIndex(0);
    const el = viewportRef.current;
    if (el) el.scrollTo({ left: 0, behavior: "auto" });
  }, [displayFeatured]);

  const nFeatured = displayFeatured.length;

  const scrollCarouselTo = useCallback(
    (i: number) => {
      const el = viewportRef.current;
      if (!el || nFeatured < 1) return;
      const clamped = ((i % nFeatured) + nFeatured) % nFeatured;
      setCarouselIndex(clamped);
      el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    },
    [nFeatured]
  );

  useEffect(() => {
    if (nFeatured <= 1 || carouselAutoMs <= 0) return;
    const t = window.setInterval(() => {
      setCarouselIndex((prev) => {
        const next = (prev + 1) % nFeatured;
        const el = viewportRef.current;
        if (el) el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
        return next;
      });
    }, carouselAutoMs);
    return () => window.clearInterval(t);
  }, [nFeatured, carouselAutoMs]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || nFeatured === 0) return;
    const onScroll = () => {
      const w = el.clientWidth || 1;
      const i = Math.round(el.scrollLeft / w);
      setCarouselIndex(Math.min(nFeatured - 1, Math.max(0, i)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [nFeatured, displayFeatured.length]);

  async function addToCart(p: Product) {
    setMsg(null);
    if (!user) {
      setMsg("Inicia sesión para agregar al carrito.");
      return;
    }
    const res = await fetch("/api/store/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ productId: p.id, quantity: 1 }),
    });
    const data = await parseResponseJson<{ error?: string }>(res);
    if (!res.ok) {
      setMsg(data.error || "No se pudo agregar");
      return;
    }
    setMsg(`Agregado: ${p.name}`);
  }

  return (
    <div>
      <section className={styles.storeIntro}>
        <div>
          <p className={styles.kicker}>Tienda</p>
          <h1 className={styles.storeIntroTitle}>Plasma Store</h1>
          <p className={styles.storeIntroLead}>
            Por ahora solo <strong>catálogo y carrito</strong>: elige productos, inicia sesión y revisa tu carrito.
            Precios en <strong>CLP</strong>. ¿Nuevo? <Link to="/registro">Crear cuenta</Link>
          </p>
        </div>
        <div className={styles.storeIntroActions}>
          <Link className={styles.btnPrimary} to="/carrito">
            Ver carrito
          </Link>
          {!user ? (
            <>
              <Link className={styles.btnGhost} to="/login">
                Entrar
              </Link>
              <Link className={styles.btnGhost} to="/registro">
                Registro
              </Link>
            </>
          ) : null}
        </div>
      </section>

      {msg && <p className={styles.banner}>{msg}</p>}

      {carouselEnabled && products.length > 0 && (
        <section className={styles.carouselSection} aria-label="Productos destacados">
          <div className={styles.carouselHead}>
            <h2 className={styles.sectionTitle}>Destacados</h2>
            <div className={styles.carouselControls}>
              <button
                type="button"
                className={styles.carouselArrow}
                aria-label="Anterior"
                onClick={() => scrollCarouselTo(carouselIndex - 1)}
              >
                ‹
              </button>
              <button
                type="button"
                className={styles.carouselArrow}
                aria-label="Siguiente"
                onClick={() => scrollCarouselTo(carouselIndex + 1)}
              >
                ›
              </button>
            </div>
          </div>

          <div className={styles.carouselShell}>
            <div className={styles.carouselViewport} ref={viewportRef}>
              <div className={styles.carouselTrack}>
                {displayFeatured.map((p, slideIdx) => (
                  <div key={`${p.id}-${slideIdx}`} className={styles.carouselSlide}>
                    <div className={styles.carouselCard}>
                      <div className={styles.carouselVisual} aria-hidden>
                        {resolveStoreMediaUrl(p.image_url) ? (
                          <img
                            className={styles.carouselImage}
                            src={resolveStoreMediaUrl(p.image_url)}
                            alt=""
                          />
                        ) : (
                          <span className={styles.carouselGlyph}>🃏</span>
                        )}
                      </div>
                      <div className={styles.carouselBody}>
                        <h3 className={styles.carouselName}>{p.name}</h3>
                        <p className={styles.carouselDesc}>{p.description}</p>
                        <p className={styles.carouselPrice}>{formatCLP(p.price_cents)}</p>
                        <button
                          type="button"
                          className={styles.btnPrimary}
                          onClick={() => addToCart(p)}
                          disabled={p.stock < 1}
                        >
                          {p.stock < 1 ? "Agotado" : "Al carrito"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {nFeatured > 1 && (
            <div className={styles.carouselDots} role="tablist" aria-label="Seleccionar slide">
              {displayFeatured.map((p, i) => (
                <button
                  key={`dot-${p.id}-${i}`}
                  type="button"
                  role="tab"
                  aria-selected={i === carouselIndex}
                  className={i === carouselIndex ? styles.carouselDotActive : styles.carouselDot}
                  onClick={() => scrollCarouselTo(i)}
                  aria-label={`Ver ${p.name}`}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <section className={styles.catalogSection}>
        <h2 className={styles.sectionTitle}>Todo el catálogo</h2>
        <div className={styles.grid}>
          {products.map((p) => (
            <article key={p.id} className={styles.card}>
              <div className={styles.cardThumb} aria-hidden>
                {resolveStoreMediaUrl(p.image_url) ? (
                  <img className={styles.cardImage} src={resolveStoreMediaUrl(p.image_url)} alt="" />
                ) : (
                  <span>🎴</span>
                )}
              </div>
              <h2 className={styles.cardTitle}>{p.name}</h2>
              <p className={styles.cardDesc}>{p.description}</p>
              <p className={styles.price}>{formatCLP(p.price_cents)}</p>
              <p className={styles.stock}>Stock: {p.stock}</p>
              <button type="button" className={styles.btnPrimary} onClick={() => addToCart(p)} disabled={p.stock < 1}>
                {p.stock < 1 ? "Agotado" : "Al carrito"}
              </button>
            </article>
          ))}
        </div>
        {products.length === 0 && <p className={styles.muted}>Cargando productos…</p>}
      </section>
    </div>
  );
}

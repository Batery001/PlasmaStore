import { useCallback, useEffect, useRef, useState } from "react";
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
const AUTO_MS = 6000;

/** Inicio = catálogo: carrusel de destacados + rejilla completa. */
export function Home() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/store/products")
      .then(async (r) => parseResponseJson<{ products?: Product[] }>(r))
      .then((d) => setProducts(d.products || []))
      .catch(() => setProducts([]));
  }, []);

  const featured = products.slice(0, Math.min(CAROUSEL_MAX, products.length));
  const nFeatured = featured.length;

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
    if (nFeatured <= 1) return;
    const t = window.setInterval(() => {
      setCarouselIndex((prev) => {
        const next = (prev + 1) % nFeatured;
        const el = viewportRef.current;
        if (el) el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
        return next;
      });
    }, AUTO_MS);
    return () => window.clearInterval(t);
  }, [nFeatured]);

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
  }, [nFeatured, products.length]);

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
          <p className={styles.kicker}>Team Plasma</p>
          <h1 className={styles.storeIntroTitle}>Plasma Store</h1>
          <p className={styles.storeIntroLead}>
            Cartas Pokémon, sobres y accesorios. Precios en <strong>CLP</strong>. Carrusel de destacados y catálogo
            completo. <Link to="/registro">Crear cuenta</Link>
          </p>
        </div>
        <div className={styles.storeIntroActions}>
          {!user && (
            <>
              <Link className={styles.btnPrimary} to="/login">
                Entrar
              </Link>
              <Link className={styles.btnGhost} to="/registro">
                Registro
              </Link>
            </>
          )}
        </div>
      </section>

      {msg && <p className={styles.banner}>{msg}</p>}

      {products.length > 0 && (
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
                {featured.map((p) => (
                  <div key={p.id} className={styles.carouselSlide}>
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
              {featured.map((p, i) => (
                <button
                  key={p.id}
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

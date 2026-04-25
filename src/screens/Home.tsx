import { useEffect, useMemo, useState } from "react";
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
  compare_price_cents?: number;
  stock: number;
  image_url?: string | null;
  tags?: string[];
};

/** Inicio = catálogo: búsqueda + rejilla completa. */
export function Home() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    fetch("/api/store/products")
      .then(async (r) => parseResponseJson<{ products?: Product[] }>(r))
      .then((d) => {
        const list = d.products || [];
        // Catálogo general (sellados/otros) excluye singles
        setProducts(list.filter((p) => !(Array.isArray(p.tags) && p.tags.includes("singles"))));
      })
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    if (!user) {
      setCartCount(0);
      return;
    }
    let alive = true;
    fetch("/api/store/cart", { credentials: "include" })
      .then(async (r) => parseResponseJson<{ ok?: boolean; items?: Array<{ quantity?: number }> }>(r))
      .then((d) => {
        if (!alive) return;
        const items = Array.isArray(d.items) ? d.items : [];
        const n = items.reduce((acc, it) => acc + (parseInt(String(it.quantity ?? 0), 10) || 0), 0);
        setCartCount(Math.max(0, n));
      })
      .catch(() => {
        if (!alive) return;
        setCartCount(0);
      });
    return () => {
      alive = false;
    };
  }, [user]);

  const filteredProducts = useMemo(() => {
    const needle = String(q || "")
      .trim()
      .toLowerCase();
    if (!needle) return products;
    return products.filter((p) => {
      const hay = `${p.name || ""} ${p.description || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [products, q]);


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
    setCartCount((c) => c + 1);
    setMsg(`Agregado: ${p.name}`);
  }

  return (
    <div>
      <section className={styles.storeIntro}>
        <div className={styles.storeIntroTop}>
          <div>
            <p className={styles.kicker}>Tienda</p>
            <h1 className={styles.storeIntroTitle}>Plasma Store</h1>
          </div>
          <div className={styles.storeIntroActions}>
            <Link className={styles.btnPrimary} to="/carrito">
              Ver carrito {cartCount > 0 ? <span className={styles.cartCount}>({cartCount})</span> : null}
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
        </div>
        <div>
          <div className={styles.searchRow}>
            <input
              className={styles.searchInput}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar productos…"
              aria-label="Buscar productos"
            />
            {q.trim() ? (
              <button type="button" className={styles.searchClear} onClick={() => setQ("")} aria-label="Limpiar búsqueda">
                ✕
              </button>
            ) : null}
          </div>
          <p className={styles.searchHint}>
            {q.trim() ? (
              <>
                Mostrando <strong>{filteredProducts.length}</strong> de <strong>{products.length}</strong>.
              </>
            ) : (
              <>
                Productos: <strong>{products.length}</strong>. Busca por nombre o descripción.
              </>
            )}
          </p>
        </div>
      </section>

      {msg && <p className={styles.banner}>{msg}</p>}

      <section className={styles.catalogSection}>
        <h2 className={styles.sectionTitle}>Todo el catálogo</h2>
        <div className={styles.grid}>
          {filteredProducts.map((p) => (
            <article key={p.id} className={styles.card}>
              <div className={styles.cardThumb} aria-hidden>
                {typeof p.compare_price_cents === "number" && p.compare_price_cents > p.price_cents ? (
                  <span className={styles.badgeOffer}>Oferta</span>
                ) : null}
                <Link to={`/producto/${p.id}`} className={styles.cardLinkCover} aria-label={`Ver ${p.name}`} />
                {resolveStoreMediaUrl(p.image_url) ? (
                  <img className={styles.cardImage} src={resolveStoreMediaUrl(p.image_url)} alt="" />
                ) : (
                  <span>🎴</span>
                )}
              </div>
              <h2 className={styles.cardTitle}>
                <Link to={`/producto/${p.id}`} className={styles.cardTitleLink}>
                  {p.name}
                </Link>
              </h2>
              <p className={styles.cardDesc}>{p.description}</p>
              {typeof p.compare_price_cents === "number" && p.compare_price_cents > p.price_cents ? (
                <p className={styles.priceRow}>
                  <span className={styles.priceOld}>{formatCLP(p.compare_price_cents)}</span>
                  <span className={styles.priceNew}>{formatCLP(p.price_cents)}</span>
                </p>
              ) : (
                <p className={styles.price}>{formatCLP(p.price_cents)}</p>
              )}
              <p className={styles.stock}>Stock: {p.stock}</p>
              <button type="button" className={styles.btnPrimary} onClick={() => addToCart(p)} disabled={p.stock < 1}>
                {p.stock < 1 ? "Agotado" : "Al carrito"}
              </button>
            </article>
          ))}
        </div>
        {products.length === 0 && <p className={styles.muted}>Cargando productos…</p>}
        {products.length > 0 && filteredProducts.length === 0 ? (
          <p className={styles.muted}>No hay resultados para “{q.trim()}”.</p>
        ) : null}
      </section>
    </div>
  );
}

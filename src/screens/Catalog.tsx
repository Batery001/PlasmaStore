import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resolveStoreMediaUrl } from "../lib/media";
import { parseResponseJson } from "../lib/parseResponseJson";
import { formatCLP } from "../lib/money";
import { useAuth } from "../auth/AuthContext";
import { notifyCartChanged } from "../lib/cartEvents";
import styles from "./pages.module.css";

type Product = {
  id: number;
  name: string;
  description: string;
  price_cents: number;
  compare_price_cents?: number;
  stock: number;
  image_url?: string | null;
  image_urls?: string[];
  tags?: string[];
};

/** Catálogo de tienda (productos sellados / generales). */
export function Catalog() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tag = (searchParams.get("tag") || "").trim();
  const [products, setProducts] = useState<Product[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState(() => (searchParams.get("q") || "").trim());
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    setQ((searchParams.get("q") || "").trim());
  }, [searchParams]);

  useEffect(() => {
    const qs = tag ? `?tag=${encodeURIComponent(tag)}` : "";
    fetch(`/api/store/products${qs ? `${qs}&` : "?"}limit=96`)
      .then(async (r) => parseResponseJson<{ products?: Product[] }>(r))
      .then((d) => setProducts(d.products || []))
      .catch(() => setProducts([]));
  }, [tag]);

  useEffect(() => {
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

  function onSearchChange(value: string) {
    setQ(value);
    const next = new URLSearchParams(searchParams);
    const trimmed = value.trim();
    if (trimmed) next.set("q", trimmed);
    else next.delete("q");
    setSearchParams(next, { replace: true });
  }

  async function addToCart(p: Product) {
    setMsg(null);
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
    notifyCartChanged();
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
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar productos…"
              aria-label="Buscar productos"
              type="search"
            />
            {q.trim() ? (
              <button type="button" className={styles.searchClear} onClick={() => onSearchChange("")}>
                Limpiar
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
                Productos: <strong>{products.length}</strong>
                {tag ? (
                  <>
                    {" "}
                    · etiqueta <strong>{tag}</strong>
                  </>
                ) : null}
                . Busca por nombre o descripción.
              </>
            )}
          </p>
        </div>
      </section>

      {msg ? <p className={styles.banner}>{msg}</p> : null}

      <section className={styles.catalogSection}>
        <h2 className={styles.sectionTitle}>Todo el catálogo</h2>
        <div className={styles.grid}>
          {filteredProducts.map((p) => {
            const cover = resolveStoreMediaUrl((Array.isArray(p.image_urls) && p.image_urls[0]) || p.image_url);
            return (
              <article key={p.id} className={styles.card}>
                <div className={styles.cardThumb} aria-hidden>
                  {typeof p.compare_price_cents === "number" && p.compare_price_cents > p.price_cents ? (
                    <span className={styles.badgeOffer}>Oferta</span>
                  ) : null}
                  <Link to={`/producto/${p.id}`} className={styles.cardLinkCover} aria-label={`Ver ${p.name}`} />
                  {cover ? (
                    <img className={styles.cardImage} src={cover} alt="" loading="lazy" decoding="async" />
                  ) : null}
                </div>
                <Link to={`/producto/${p.id}`} className={styles.cardTitleLink}>
                  <h3 className={styles.cardTitle}>{p.name}</h3>
                </Link>
                <p className={styles.cardDesc}>{p.description}</p>
                <div className={styles.priceRow}>
                  <span className={styles.price}>{formatCLP(p.price_cents)}</span>
                  <span className={styles.stock}>{p.stock > 0 ? `Stock ${p.stock}` : "Agotado"}</span>
                </div>
                <button type="button" className={styles.btnPrimary} onClick={() => addToCart(p)} disabled={p.stock < 1}>
                  {p.stock < 1 ? "Agotado" : "Agregar al carrito"}
                </button>
              </article>
            );
          })}
        </div>
        {filteredProducts.length === 0 ? <p className={styles.muted}>No hay productos para mostrar.</p> : null}
      </section>
    </div>
  );
}

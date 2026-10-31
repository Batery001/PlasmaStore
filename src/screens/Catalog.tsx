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
  const [onlyStock, setOnlyStock] = useState(() => searchParams.get("stock") === "1");
  const [onlyOffers, setOnlyOffers] = useState(() => searchParams.get("oferta") === "1");
  const [maxPrice, setMaxPrice] = useState(() => searchParams.get("max") || "");
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
    const max = parseInt(String(maxPrice || ""), 10);
    return products.filter((p) => {
      if (needle) {
        const hay = `${p.name || ""} ${p.description || ""} ${(p.tags || []).join(" ")}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (onlyStock && !(p.stock > 0)) return false;
      if (
        onlyOffers &&
        !(typeof p.compare_price_cents === "number" && p.compare_price_cents > p.price_cents)
      ) {
        return false;
      }
      if (Number.isFinite(max) && max > 0 && p.price_cents > max) return false;
      return true;
    });
  }, [products, q, onlyStock, onlyOffers, maxPrice]);

  function syncParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  }

  function onSearchChange(value: string) {
    setQ(value);
    syncParams({ q: value.trim() || null });
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
          <div className={styles.searchRow} style={{ marginTop: "0.5rem", flexWrap: "wrap", gap: "0.65rem" }}>
            <label className={styles.muted} style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={onlyStock}
                onChange={(e) => {
                  setOnlyStock(e.target.checked);
                  syncParams({ stock: e.target.checked ? "1" : null });
                }}
              />
              Con stock
            </label>
            <label className={styles.muted} style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={onlyOffers}
                onChange={(e) => {
                  setOnlyOffers(e.target.checked);
                  syncParams({ oferta: e.target.checked ? "1" : null });
                }}
              />
              Solo ofertas
            </label>
            <label className={styles.muted} style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
              Precio máx.
              <input
                className={styles.input}
                style={{ width: 110, margin: 0 }}
                inputMode="numeric"
                placeholder="CLP"
                value={maxPrice}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setMaxPrice(v);
                  syncParams({ max: v || null });
                }}
              />
            </label>
          </div>
          {!user ? (
            <p className={styles.banner} style={{ marginTop: "0.65rem" }}>
              Podés armar el carrito sin cuenta. Al pagar pedimos RUT y correo; si después iniciás sesión, se
              guarda tu carrito.
            </p>
          ) : null}
          <p className={styles.searchHint}>
            Mostrando <strong>{filteredProducts.length}</strong> de <strong>{products.length}</strong>
            {tag ? (
              <>
                {" "}
                · etiqueta <strong>{tag}</strong>
              </>
            ) : null}
            .
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

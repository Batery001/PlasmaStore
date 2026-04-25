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
  image_urls?: string[];
  tags?: string[];
};

export function SinglesCatalog() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cartCount, setCartCount] = useState(0);
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<"relevance" | "price_asc" | "price_desc" | "name_asc">("relevance");
  const [page, setPage] = useState(1);
  const pageSize = 48;

  useEffect(() => {
    fetch("/api/store/products?tag=singles")
      .then(async (r) => parseResponseJson<{ products?: Product[] }>(r))
      .then((d) => setProducts(d.products || []))
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
    const min = parseInt(String(minPrice || "").replace(/[^\d]/g, ""), 10);
    const max = parseInt(String(maxPrice || "").replace(/[^\d]/g, ""), 10);

    let list = products;
    if (onlyInStock) list = list.filter((p) => (p.stock || 0) > 0);
    if (Number.isFinite(min)) list = list.filter((p) => (p.price_cents || 0) >= min);
    if (Number.isFinite(max)) list = list.filter((p) => (p.price_cents || 0) <= max);

    if (!needle) return list;
    return list.filter((p) => {
      const hay = `${p.name || ""} ${p.description || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [products, q, onlyInStock, minPrice, maxPrice]);

  const sortedProducts = useMemo(() => {
    const list = [...filteredProducts];
    if (sort === "price_asc") list.sort((a, b) => (a.price_cents || 0) - (b.price_cents || 0));
    if (sort === "price_desc") list.sort((a, b) => (b.price_cents || 0) - (a.price_cents || 0));
    if (sort === "name_asc") list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    return list;
  }, [filteredProducts, sort]);

  const nPages = Math.max(1, Math.ceil(sortedProducts.length / pageSize));
  const pageClamped = Math.min(nPages, Math.max(1, page));
  const pageItems = useMemo(() => {
    const start = (pageClamped - 1) * pageSize;
    return sortedProducts.slice(start, start + pageSize);
  }, [sortedProducts, pageClamped]);

  useEffect(() => {
    setPage(1);
  }, [q, onlyInStock, minPrice, maxPrice, sort]);

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
    <div className={styles.singlesShell}>
      <div className={styles.singlesTopbar}>
        <div>
          <div className={styles.singlesKicker}>Pokémon · Singles</div>
          <div className={styles.singlesTitle}>Cartas · Catálogo</div>
        </div>
        <div className={styles.singlesTopActions}>
          <Link className={styles.singlesTopBtn} to="/carrito">
            Carrito {cartCount > 0 ? <span className={styles.singlesPill}>{cartCount}</span> : null}
          </Link>
        </div>
      </div>

      {msg && <p className={styles.banner}>{msg}</p>}

      <div className={styles.singlesLayout}>
        <aside className={styles.singlesSidebar} aria-label="Filtros">
          <div className={styles.singlesFilterTitle}>Filtros</div>

          <label className={styles.singlesField}>
            Buscar
            <input
              className={styles.singlesInput}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cartas…"
            />
          </label>

          <label className={styles.singlesCheck}>
            <input type="checkbox" checked={onlyInStock} onChange={(e) => setOnlyInStock(e.target.checked)} /> En stock
          </label>

          <div className={styles.singlesRow2}>
            <label className={styles.singlesField}>
              Precio mín (CLP)
              <input className={styles.singlesInput} value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="0" />
            </label>
            <label className={styles.singlesField}>
              Precio máx (CLP)
              <input className={styles.singlesInput} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="999990" />
            </label>
          </div>

          <div className={styles.singlesHint}>
            Mostrando <b>{sortedProducts.length}</b> resultado(s).
          </div>
        </aside>

        <section className={styles.singlesMain} aria-label="Resultados">
          <div className={styles.singlesControls}>
            <div className={styles.singlesResults}>
              {sortedProducts.length} resultado(s) · Página {pageClamped} de {nPages}
            </div>
            <div className={styles.singlesSort}>
              <span>Ordenar:</span>
              <select
                className={styles.singlesSelect}
                value={sort}
                onChange={(e) => {
                  const v = e.target.value;
                  setSort(v === "price_asc" || v === "price_desc" || v === "name_asc" ? v : "relevance");
                }}
              >
                <option value="relevance">Relevancia</option>
                <option value="price_asc">Precio: menor a mayor</option>
                <option value="price_desc">Precio: mayor a menor</option>
                <option value="name_asc">Nombre (A–Z)</option>
              </select>
            </div>
          </div>

          <div className={styles.singlesGrid}>
            {pageItems.map((p) => {
              const cover = resolveStoreMediaUrl((Array.isArray(p.image_urls) && p.image_urls[0]) || p.image_url);
              return (
                <article key={p.id} className={styles.singlesCard}>
                  <Link to={`/producto/${p.id}`} className={styles.singlesCardLink} aria-label={`Ver ${p.name}`}>
                    <div className={styles.singlesThumb} aria-hidden>
                      {cover ? <img className={styles.singlesImg} src={cover} alt="" /> : <span className={styles.singlesGlyph}>🎴</span>}
                    </div>
                    <div className={styles.singlesCardBody}>
                      <div className={styles.singlesName}>{p.name}</div>
                      <div className={styles.singlesPrice}>{formatCLP(p.price_cents)}</div>
                      <div className={styles.singlesMeta}>{p.stock > 0 ? "En stock" : "Agotado"}</div>
                    </div>
                  </Link>
                  <button type="button" className={styles.singlesAddBtn} onClick={() => addToCart(p)} disabled={p.stock < 1}>
                    {p.stock < 1 ? "Agotado" : "Agregar"}
                  </button>
                </article>
              );
            })}
          </div>

          {sortedProducts.length === 0 ? <div className={styles.singlesEmpty}>No hay resultados.</div> : null}

          {nPages > 1 ? (
            <div className={styles.singlesPager}>
              <button type="button" className={styles.singlesPagerBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageClamped <= 1}>
                ←
              </button>
              <div className={styles.singlesPagerMid}>
                Página {pageClamped} / {nPages}
              </div>
              <button type="button" className={styles.singlesPagerBtn} onClick={() => setPage((p) => Math.min(nPages, p + 1))} disabled={pageClamped >= nPages}>
                →
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}


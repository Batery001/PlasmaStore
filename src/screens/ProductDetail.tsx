import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
  compare_price_cents?: number | null;
  stock: number;
  image_url?: string | null;
  image_urls?: string[];
};

export function ProductDetail() {
  const { id } = useParams();
  const pid = useMemo(() => parseInt(String(id || ""), 10), [id]);
  const { user } = useAuth();
  const [p, setP] = useState<Product | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [activeImg, setActiveImg] = useState<string | null>(null);

  const imgList = useMemo(() => {
    if (!p) return [];
    const rawList =
      Array.isArray(p.image_urls) && p.image_urls.length > 0 ? p.image_urls : p.image_url ? [p.image_url] : [];
    return rawList.map((u) => resolveStoreMediaUrl(u)).filter(Boolean) as string[];
  }, [p]);

  useEffect(() => {
    // Mantener imagen activa consistente con el producto cargado
    setActiveImg(imgList[0] ?? null);
  }, [pid, imgList]);

  useEffect(() => {
    setErr(null);
    setMsg(null);
    setP(null);
    if (!Number.isFinite(pid) || pid < 1) {
      setErr("Producto inválido.");
      return;
    }
    fetch(`/api/store/products/${pid}`)
      .then(async (r) => parseResponseJson<{ ok?: boolean; error?: string; product?: Product }>(r))
      .then((d) => {
        if (!d?.ok || !d?.product) {
          setErr(d?.error || "Producto no encontrado.");
          return;
        }
        setP(d.product);
        setQty(1);
      })
      .catch(() => setErr("No se pudo cargar el producto."));
  }, [pid]);

  async function addToCart(goToCart: boolean) {
    setMsg(null);
    if (!p) return;
    if (!user) {
      setMsg("Inicia sesión para agregar al carrito.");
      return;
    }
    const q = Math.max(1, Math.min(99, Math.floor(Number(qty) || 1)));
    const res = await fetch("/api/store/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ productId: p.id, quantity: q }),
    });
    const data = await parseResponseJson<{ error?: string }>(res);
    if (!res.ok) {
      setMsg(data.error || "No se pudo agregar");
      return;
    }
    if (goToCart) {
      window.location.href = "/carrito";
      return;
    }
    setMsg("Agregado al carrito.");
  }

  if (err) {
    return (
      <div className={styles.page}>
        <div className={styles.detailWrap}>
          <h1 className={styles.pageTitle}>Producto</h1>
          <p className={styles.error}>{err}</p>
          <Link className={styles.btnGhost} to="/catalogo">
            Volver al catálogo
          </Link>
        </div>
      </div>
    );
  }

  if (!p) {
    return (
      <div className={styles.page}>
        <div className={styles.detailWrap}>
          <p className={styles.muted}>Cargando…</p>
        </div>
      </div>
    );
  }
  const hasOffer = typeof p.compare_price_cents === "number" && p.compare_price_cents > p.price_cents;

  const hero = activeImg ?? imgList[0] ?? null;

  return (
    <div className={styles.page}>
      <div className={styles.detailWrap}>
        <div className={styles.detailGrid}>
          <div className={styles.detailLeft}>
            <div className={styles.detailImageFrame} aria-hidden>
              {hero ? <img className={styles.detailImage} src={hero} alt="" /> : <span className={styles.detailGlyph}>🎴</span>}
            </div>
            <div className={styles.detailThumbs} aria-hidden>
              {imgList.map((src, i) => (
                <button
                  key={`${src}-${i}`}
                  type="button"
                  className={styles.detailThumbBtn}
                  onClick={() => setActiveImg(src)}
                >
                  <img className={styles.detailThumbImg} src={src} alt="" />
                </button>
              ))}
            </div>
          </div>

          <div className={styles.detailRight}>
            <h1 className={styles.detailTitle}>{p.name}</h1>

            {hasOffer ? (
              <div className={styles.detailPriceRow}>
                <span className={styles.detailPriceOld}>{formatCLP(p.compare_price_cents as number)}</span>
                <span className={styles.detailPriceNew}>{formatCLP(p.price_cents)}</span>
              </div>
            ) : (
              <div className={styles.detailPriceSolo}>{formatCLP(p.price_cents)}</div>
            )}

            <div className={styles.detailTax}>Impuesto incluido.</div>

            {msg ? <p className={styles.banner}>{msg}</p> : null}

            <div className={styles.detailActions}>
              <button type="button" className={styles.detailBtnLight} onClick={() => addToCart(false)} disabled={p.stock < 1}>
                {p.stock < 1 ? "Agotado" : "Agregar al carrito"}
              </button>
              <button type="button" className={styles.detailBtnDark} onClick={() => addToCart(true)} disabled={p.stock < 1}>
                Comprar ahora
              </button>
            </div>

            <div className={styles.detailQtyRow}>
              <span className={styles.detailQtyLabel}>Cantidad</span>
              <div className={styles.detailQtyControl}>
                <button type="button" onClick={() => setQty((q) => Math.max(1, (Number(q) || 1) - 1))}>
                  −
                </button>
                <input
                  value={String(qty)}
                  inputMode="numeric"
                  onChange={(e) => setQty(parseInt(e.target.value.replace(/[^\d]/g, ""), 10) || 1)}
                />
                <button type="button" onClick={() => setQty((q) => Math.min(99, (Number(q) || 1) + 1))}>
                  +
                </button>
              </div>
              <span className={styles.detailStockHint}>Stock: {p.stock}</span>
            </div>

            {p.description ? (
              <div className={styles.detailDescBlock}>
                <div className={styles.detailDescTitle}>Descripción</div>
                <div className={styles.detailDesc}>{p.description}</div>
              </div>
            ) : null}

            <div className={styles.detailBackRow}>
              <Link className={styles.btnGhost} to="/catalogo">
                Volver al catálogo
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


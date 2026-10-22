import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatCLP } from "../lib/money";
import { parseResponseJson } from "../lib/parseResponseJson";
import { useAuth } from "../auth/AuthContext";
import { notifyCartChanged } from "../lib/cartEvents";
import { formatEventPlayerSummary, type EventPlayer } from "../lib/eventPlayer";
import styles from "./pages.module.css";

type Line = {
  productId: number;
  quantity: number;
  name: string;
  price_cents: number;
  line_total_cents?: number;
  stock: number;
  image_url?: string | null;
  product_kind?: string;
  event_id?: number | null;
  event_player?: EventPlayer | null;
};

export function Cart() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Line[]>([]);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/store/cart", { credentials: "include" });
      if (!res.ok) {
        setItems([]);
        return;
      }
      const data = await parseResponseJson<{ items?: Line[] }>(res);
      setItems(data.items || []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    reload();
  }, [loading, reload]);

  async function setQty(productId: number, quantity: number) {
    await fetch("/api/store/cart", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ productId, quantity }),
    });
    reload();
    notifyCartChanged();
  }

  async function removeLine(productId: number) {
    await fetch(`/api/store/cart/${productId}`, { method: "DELETE", credentials: "include" });
    reload();
    notifyCartChanged();
  }

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + (typeof i.line_total_cents === "number" ? i.line_total_cents : i.price_cents * i.quantity), 0),
    [items]
  );

  if (loading) return <p className={styles.muted}>Cargando…</p>;

  return (
    <div>
      <p className={styles.checkoutSteps}>
        <span className={styles.checkoutStepOn}>1. Carrito</span>
        <span className={styles.checkoutStepMuted}>2. Entrega y pago</span>
      </p>
      <h1 className={styles.pageTitle}>Tu carrito</h1>
      {!user ? (
        <p className={styles.muted}>
          Compra como invitado o <Link to="/login">inicia sesión</Link> / <Link to="/registro">regístrate</Link>.
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className={styles.muted}>
          Vacío. <Link to="/catalogo">Seguir comprando</Link>
        </p>
      ) : (
        <>
          <ul className={styles.cartList}>
            {items.map((i) => (
              <li key={i.productId} className={styles.cartRowReview}>
                {i.image_url ? (
                  <img className={styles.cartThumb} src={i.image_url} alt="" />
                ) : (
                  <div className={styles.cartThumbFallback} aria-hidden />
                )}
                <div>
                  <strong>
                    {i.product_kind === "event" || i.event_id ? (
                      <Link to="/eventos">{i.name}</Link>
                    ) : (
                      <Link to={`/producto/${i.productId}`}>{i.name}</Link>
                    )}
                  </strong>
                  <div className={styles.muted}>
                    {formatCLP(i.price_cents)} c/u · máx.{" "}
                    {i.product_kind === "event" || i.event_id ? `cupos ${i.stock}` : `stock ${i.stock}`}
                    {i.event_player ? ` · ${formatEventPlayerSummary(i.event_player)}` : ""}
                  </div>
                </div>
                <div className={styles.qtyRow}>
                  {i.product_kind === "event" || i.event_id ? (
                    <span className={styles.muted}>1 cupo</span>
                  ) : (
                    <input
                      type="number"
                      min={1}
                      max={i.stock}
                      className={styles.qty}
                      value={i.quantity}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (Number.isFinite(v) && v >= 1) setQty(i.productId, v);
                      }}
                    />
                  )}
                  <button type="button" className={styles.linkbtn} onClick={() => removeLine(i.productId)}>
                    Quitar
                  </button>
                </div>
                <div className={styles.lineTotal}>
                  {formatCLP(typeof i.line_total_cents === "number" ? i.line_total_cents : i.price_cents * i.quantity)}
                </div>
              </li>
            ))}
          </ul>

          <div className={styles.totalsBox}>
            <div className={`${styles.totalsRow} ${styles.totalsGrand}`}>
              <span>Subtotal</span>
              <strong>{formatCLP(subtotal)}</strong>
            </div>
            <p className={styles.muted} style={{ margin: "0.4rem 0 0" }}>
              El envío y el pago se confirman en el siguiente paso.
            </p>
          </div>

          <div className={styles.heroActions} style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
            <button type="button" className={styles.btnPrimary} onClick={() => navigate("/checkout")}>
              Confirmar y continuar
            </button>
            <Link className={styles.btnGhost} to="/catalogo">
              Seguir comprando
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatCLP } from "../lib/money";
import { useAuth } from "../auth/AuthContext";
import styles from "./pages.module.css";

type Line = {
  productId: number;
  quantity: number;
  name: string;
  price_cents: number;
  stock: number;
};

export function Cart() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<Line[]>([]);

  const reload = useCallback(async () => {
    const res = await fetch("/api/store/cart", { credentials: "include" });
    if (!res.ok) {
      setItems([]);
      return;
    }
    const data = await res.json();
    setItems(data.items || []);
  }, []);

  useEffect(() => {
    if (!loading && user) reload();
    if (!loading && !user) setItems([]);
  }, [user, loading, reload]);

  async function setQty(productId: number, quantity: number) {
    await fetch("/api/store/cart", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ productId, quantity }),
    });
    reload();
  }

  async function removeLine(productId: number) {
    await fetch(`/api/store/cart/${productId}`, { method: "DELETE", credentials: "include" });
    reload();
  }

  if (loading) return <p className={styles.muted}>Cargando…</p>;
  if (!user) {
    return (
      <div className={styles.narrow}>
        <h1 className={styles.pageTitle}>Carrito</h1>
        <p className={styles.muted}>
          <Link to="/login">Inicia sesión</Link> para ver tu carrito.
        </p>
      </div>
    );
  }

  const total = items.reduce((s, i) => s + i.price_cents * i.quantity, 0);

  return (
    <div>
      <h1 className={styles.pageTitle}>Carrito</h1>
      {items.length === 0 ? (
        <p className={styles.muted}>
          Vacío. <Link to="/catalogo">Ir al catálogo</Link>
        </p>
      ) : (
        <>
          <ul className={styles.cartList}>
            {items.map((i) => (
              <li key={i.productId} className={styles.cartRow}>
                <div>
                  <strong>{i.name}</strong>
                  <div className={styles.muted}>{formatCLP(i.price_cents)} c/u · máx. stock {i.stock}</div>
                </div>
                <div className={styles.qtyRow}>
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
                  <button type="button" className={styles.linkbtn} onClick={() => removeLine(i.productId)}>
                    Quitar
                  </button>
                </div>
                <div className={styles.lineTotal}>{formatCLP(i.price_cents * i.quantity)}</div>
              </li>
            ))}
          </ul>
          <p className={styles.total}>
            Total estimado: <strong>{formatCLP(total)}</strong>
          </p>
          <p className={styles.muted}>Demo: no hay pasarela de pago. En tienda real conectarías checkout aquí.</p>
        </>
      )}
    </div>
  );
}

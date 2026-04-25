import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatCLP } from "../lib/money";
import { parseResponseJson } from "../lib/parseResponseJson";
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
  const [msg, setMsg] = useState<string | null>(null);

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
      {msg ? <p className={styles.banner}>{msg}</p> : null}
      {items.length === 0 ? (
        <p className={styles.muted}>
          Vacío. <Link to="/catalogo">Seguir comprando</Link>
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
            Total estimado (CLP): <strong>{formatCLP(total)}</strong>
          </p>
          <p className={styles.muted}>
            Todos los montos están en pesos chilenos (CLP). Demo: sin pasarela de pago.
          </p>
          <div className={styles.heroActions} style={{ justifyContent: "flex-start" }}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={async () => {
                setMsg(null);
                try {
                  const r = await fetch("/api/store/checkout/webpay/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({}),
                  });
                  const j = await r.json().catch(() => ({}));
                  if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo iniciar Webpay.");
                  const form = document.createElement("form");
                  form.method = "POST";
                  form.action = j.url;
                  const input = document.createElement("input");
                  input.type = "hidden";
                  input.name = "token_ws";
                  input.value = j.token;
                  form.appendChild(input);
                  document.body.appendChild(form);
                  form.submit();
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Error iniciando pago.");
                }
              }}
            >
              Pagar con Webpay
            </button>
          </div>
        </>
      )}
    </div>
  );
}

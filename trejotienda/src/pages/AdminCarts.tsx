import { FormEvent, Fragment, useEffect, useState } from "react";
import { formatCLP } from "../lib/money";
import adminStyles from "../admin/admin.module.css";

type CartItem = {
  productId: number;
  quantity: number;
  name: string;
  price_cents: number;
  productStock: number;
};

type CartRow = {
  userId: number;
  email: string;
  name: string;
  role: string;
  items: CartItem[];
  totalCents: number;
  units: number;
  lineCount: number;
};

export function AdminCarts() {
  const [carts, setCarts] = useState<CartRow[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});

  const reload = async () => {
    const res = await fetch("/api/store/admin/carts", { credentials: "include" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error");
    setCarts(data.carts || []);
  };

  useEffect(() => {
    reload().catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, []);

  async function clearCart(userId: number) {
    setMsg(null);
    setErr(null);
    if (!window.confirm("¿Vaciar por completo el carrito de este cliente?")) return;
    const res = await fetch(`/api/store/admin/carts/${userId}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Error");
      return;
    }
    setMsg(`Carrito vaciado (${data.removed} líneas eliminadas).`);
    await reload();
    setExpanded(null);
  }

  async function setLineQty(userId: number, productId: number, quantity: number) {
    setErr(null);
    const res = await fetch("/api/store/admin/cart-item", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ userId, productId, quantity }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Error");
      return;
    }
    setMsg(quantity <= 0 ? "Ítem eliminado del carrito." : "Cantidad actualizada.");
    await reload();
  }

  function onQtySubmit(e: FormEvent, userId: number, productId: number) {
    e.preventDefault();
    const key = `${userId}-${productId}`;
    const q = parseInt(qtyDraft[key] ?? "0", 10);
    if (!Number.isFinite(q)) return;
    setLineQty(userId, productId, q).catch(() => {});
  }

  return (
    <div>
      <h1 className={adminStyles.pageTitle}>Carritos activos</h1>
      <p className={adminStyles.pageLead}>
        Listado de clientes con artículos en el carrito. Puedes ajustar cantidades o vaciar el carrito
        (similar a herramientas de soporte en paneles tipo OpenCart).
      </p>

      {err && <p className={adminStyles.error}>{err}</p>}
      {msg && <p className={adminStyles.banner}>{msg}</p>}

      <div className={adminStyles.panelCard}>
        <h2>Clientes con carrito</h2>
        {carts.length === 0 ? (
          <p className={adminStyles.muted}>No hay carritos con ítems en este momento.</p>
        ) : (
          <div className={adminStyles.tableWrap}>
            <table className={adminStyles.table}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Rol</th>
                  <th>Líneas</th>
                  <th>Unidades</th>
                  <th>Total</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {carts.map((c) => (
                  <Fragment key={c.userId}>
                    <tr>
                      <td>
                        <strong>{c.name}</strong>
                        <div className={adminStyles.muted}>{c.email}</div>
                      </td>
                      <td>{c.role}</td>
                      <td>{c.lineCount}</td>
                      <td>{c.units}</td>
                      <td>{formatCLP(c.totalCents)}</td>
                      <td className={adminStyles.rowActions}>
                        <button
                          type="button"
                          className={adminStyles.btn}
                          onClick={() => {
                            if (expanded === c.userId) {
                              setExpanded(null);
                              return;
                            }
                            const draft: Record<string, string> = {};
                            for (const it of c.items) {
                              draft[`${c.userId}-${it.productId}`] = String(it.quantity);
                            }
                            setQtyDraft((prev) => ({ ...prev, ...draft }));
                            setExpanded(c.userId);
                          }}
                        >
                          {expanded === c.userId ? "Ocultar" : "Detalle"}
                        </button>
                        <button
                          type="button"
                          className={adminStyles.btnDanger}
                          onClick={() => clearCart(c.userId)}
                        >
                          Vaciar
                        </button>
                      </td>
                    </tr>
                    {expanded === c.userId && (
                      <tr className={adminStyles.expandRow}>
                        <td colSpan={6}>
                          <table className={adminStyles.subTable}>
                            <thead>
                              <tr>
                                <th>Producto</th>
                                <th>Precio</th>
                                <th>Stock</th>
                                <th>Cantidad</th>
                                <th>Subtotal</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {c.items.map((it) => {
                                const key = `${c.userId}-${it.productId}`;
                                return (
                                  <tr key={it.productId}>
                                    <td>{it.name}</td>
                                    <td>{formatCLP(it.price_cents)}</td>
                                    <td>{it.productStock}</td>
                                    <td>
                                      <form
                                        className={adminStyles.rowActions}
                                        onSubmit={(e) => onQtySubmit(e, c.userId, it.productId)}
                                      >
                                        <input
                                          className={adminStyles.inputSm}
                                          value={qtyDraft[key] ?? String(it.quantity)}
                                          onChange={(e) =>
                                            setQtyDraft((prev) => ({ ...prev, [key]: e.target.value }))
                                          }
                                        />
                                        <button type="submit" className={adminStyles.btnPrimary}>
                                          Guardar
                                        </button>
                                      </form>
                                    </td>
                                    <td>{formatCLP(it.quantity * it.price_cents)}</td>
                                    <td>
                                      <button
                                        type="button"
                                        className={adminStyles.btnLink}
                                        onClick={() => setLineQty(c.userId, it.productId, 0)}
                                      >
                                        Quitar
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

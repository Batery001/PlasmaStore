import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCLP } from "../lib/money";
import { resolveStoreMediaUrl } from "../lib/media";
import { parseResponseJson } from "../lib/parseResponseJson";
import { effectiveLinePricing } from "../lib/productPricing";
import { CART_CHANGED_EVENT } from "../lib/cartEvents";
import { usePosPopup } from "../pos/PosPopupContext";
import adminStyles from "../admin/admin.module.css";

type PosProduct = {
  id: number;
  name: string;
  price_cents: number;
  stock: number;
  barcode?: string | null;
  sales_channel?: string;
  image_url?: string | null;
  active?: number;
  compare_price_cents?: number | null;
  discount_percent?: number;
  promo_min_qty?: number;
  promo_bundle_total_cents?: number;
};

type CartLine = {
  productId: number;
  name: string;
  /** Precio de lista (base) del producto */
  price_cents: number;
  compare_price_cents?: number | null;
  discount_percent?: number;
  promo_min_qty?: number;
  promo_bundle_total_cents?: number;
  stock: number;
  quantity: number;
};

function linePricing(l: CartLine) {
  return effectiveLinePricing(
    {
      price_cents: l.price_cents,
      compare_price_cents: l.compare_price_cents,
      discount_percent: l.discount_percent,
      promo_min_qty: l.promo_min_qty,
      promo_bundle_total_cents: l.promo_bundle_total_cents,
    },
    l.quantity
  );
}

export function AdminPosSale({ embedded = false }: { embedded?: boolean }) {
  const posPopup = usePosPopup();
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastSale, setLastSale] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalog, setCatalog] = useState<PosProduct[]>([]);
  const [catalogFilter, setCatalogFilter] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogErr, setCatalogErr] = useState<string | null>(null);
  const catalogSearchRef = useRef<HTMLInputElement>(null);

  const importWebCart = useCallback(async () => {
    try {
      const res = await fetch("/api/store/cart", { credentials: "include" });
      if (!res.ok) return;
      const data = await parseResponseJson<{
        items?: Array<{
          productId: number;
          quantity: number;
          name: string;
          price_cents: number;
          stock: number;
          compare_price_cents?: number | null;
          discount_percent?: number;
          promo_min_qty?: number;
          promo_bundle_total_cents?: number;
        }>;
      }>(res);
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) return;
      setCart((prev) => {
        const byId = new Map(prev.map((l) => [l.productId, l]));
        for (const it of items) {
          const pid = Number(it.productId);
          const qty = Math.max(1, Number(it.quantity) || 1);
          const stock = Math.max(0, Number(it.stock) || 0);
          const existing = byId.get(pid);
          const nextQty = Math.min(stock || qty, Math.max(existing?.quantity || 0, qty));
          byId.set(pid, {
            productId: pid,
            name: it.name || existing?.name || `Producto #${pid}`,
            price_cents: it.price_cents ?? existing?.price_cents ?? 0,
            compare_price_cents: it.compare_price_cents ?? existing?.compare_price_cents ?? null,
            discount_percent: it.discount_percent ?? existing?.discount_percent ?? 0,
            promo_min_qty: it.promo_min_qty ?? existing?.promo_min_qty ?? 0,
            promo_bundle_total_cents: it.promo_bundle_total_cents ?? existing?.promo_bundle_total_cents ?? 0,
            stock: stock || existing?.stock || nextQty,
            quantity: nextQty,
          });
        }
        return Array.from(byId.values());
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    void importWebCart();
    const onChange = () => {
      void importWebCart();
    };
    window.addEventListener(CART_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CART_CHANGED_EVENT, onChange);
  }, [importWebCart]);

  useEffect(() => {
    if (!posPopup.open) return;
    void importWebCart();
  }, [posPopup.open, importWebCart]);

  useEffect(() => {
    if (!catalogOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setCatalogOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [catalogOpen]);

  const total = useMemo(() => cart.reduce((s, l) => s + linePricing(l).line_total_cents, 0), [cart]);

  const filteredCatalog = useMemo(() => {
    const needle = catalogFilter.trim().toLowerCase();
    const active = catalog.filter((p) => p.active !== 0 && (p.stock || 0) > 0);
    if (!needle) return active;
    return active.filter((p) => {
      const name = String(p.name || "").toLowerCase();
      const barcode = String(p.barcode || "").toLowerCase();
      const id = String(p.id);
      return name.includes(needle) || barcode.includes(needle) || id.includes(needle);
    });
  }, [catalog, catalogFilter]);

  const addProduct = useCallback((p: PosProduct, qty = 1) => {
    setErr(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      const nextQty = (existing?.quantity || 0) + qty;
      if (nextQty > p.stock) {
        setErr(`Stock insuficiente para ${p.name} (hay ${p.stock}).`);
        return prev;
      }
      const pricingFields = {
        price_cents: p.price_cents,
        compare_price_cents: p.compare_price_cents ?? null,
        discount_percent: p.discount_percent ?? 0,
        promo_min_qty: p.promo_min_qty ?? 0,
        promo_bundle_total_cents: p.promo_bundle_total_cents ?? 0,
      };
      if (existing) {
        return prev.map((l) =>
          l.productId === p.id
            ? {
                ...l,
                ...pricingFields,
                quantity: nextQty,
                stock: p.stock,
              }
            : l
        );
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          ...pricingFields,
          stock: p.stock,
          quantity: qty,
        },
      ];
    });
  }, []);

  async function openCatalog() {
    setCatalogOpen(true);
    setCatalogFilter("");
    setCatalogErr(null);
    setCatalogLoading(true);
    try {
      const res = await fetch("/api/store/admin/products", { credentials: "include" });
      const data = await parseResponseJson<{ error?: string; products?: PosProduct[] }>(res);
      if (!res.ok) throw new Error(data.error || "No se pudo cargar el catálogo.");
      setCatalog(Array.isArray(data.products) ? data.products : []);
      window.setTimeout(() => catalogSearchRef.current?.focus(), 50);
    } catch (ex) {
      setCatalogErr(ex instanceof Error ? ex.message : "Error al cargar catálogo.");
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  }

  function pickFromCatalog(p: PosProduct) {
    if ((p.stock || 0) <= 0) {
      setErr(`Sin stock: ${p.name}`);
      return;
    }
    addProduct(p, 1);
    setMsg(`Agregado: ${p.name}`);
    setCatalogOpen(false);
    inputRef.current?.focus();
  }

  async function lookupAndAdd(e?: FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/store/admin/pos/lookup?q=${encodeURIComponent(q)}`, { credentials: "include" });
      const data = await parseResponseJson<{ error?: string; product?: PosProduct }>(res);
      if (!res.ok || !data.product) throw new Error(data.error || "No encontrado.");
      addProduct(data.product, 1);
      setQuery("");
      setMsg(`Agregado: ${data.product.name}`);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Error al buscar.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function setQty(productId: number, quantity: number) {
    setCart((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l;
        const q = Math.max(1, Math.min(l.stock, quantity));
        return { ...l, quantity: q };
      })
    );
  }

  function removeLine(productId: number) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  async function charge(tender: "cash" | "card") {
    if (!cart.length) {
      setErr("El carrito de caja está vacío.");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/store/admin/pos/sale", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tender,
          items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        }),
      });
      const data = await parseResponseJson<{
        error?: string;
        orderId?: number;
        total_cents?: number;
        message?: string;
        reservations_broken?: number;
      }>(res);
      if (!res.ok) throw new Error(data.error || "No se pudo cobrar.");
      setLastSale(`Orden #${data.orderId} · ${formatCLP(data.total_cents || 0)} · ${tender === "card" ? "Tarjeta" : "Efectivo"}`);
      setMsg(data.message || "Venta OK.");
      setCart([]);
      await fetch("/api/store/cart", { method: "DELETE", credentials: "include" }).catch(() => {
        /* ignore */
      });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Error al cobrar.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div>
      {!embedded ? (
        <>
          <h1 className={adminStyles.pageTitle}>Caja · venta</h1>
          <p className={adminStyles.muted}>
            Escanea, busca por código/nombre o abre el catálogo. Usa el stock físico real; si hay una reserva web, esta
            venta tiene prioridad y la libera. Lo que agregues en el catálogo web (sesión admin) también aparece aquí.
          </p>
        </>
      ) : null}

      {embedded ? (
        <p className={adminStyles.muted} style={{ marginTop: 0 }}>
          Si agregas productos en el catálogo de la tienda, aparecen en esta caja.
        </p>
      ) : null}

      {msg ? <p className={adminStyles.banner}>{msg}</p> : null}
      {err ? <p className={adminStyles.error}>{err}</p> : null}
      {lastSale ? <p className={adminStyles.muted}>Última venta: {lastSale}</p> : null}

      <form className={adminStyles.panelCard} onSubmit={lookupAndAdd} style={{ marginBottom: "1rem" }}>
        <label className={adminStyles.label}>
          Código de barras / ID / nombre
          <input
            ref={inputRef}
            className={adminStyles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Escanea y Enter…"
            disabled={busy}
            autoComplete="off"
          />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.65rem" }}>
          <button type="submit" className={adminStyles.btnPrimary} disabled={busy}>
            Agregar
          </button>
          <button type="button" className={adminStyles.btn} disabled={busy} onClick={() => openCatalog()}>
            Buscar en catálogo
          </button>
        </div>
      </form>

      <div className={adminStyles.panelCard}>
        {cart.length === 0 ? (
          <p className={adminStyles.muted}>Sin ítems. Escanea el primer producto o ábrelo desde el catálogo.</p>
        ) : (
          <div className={adminStyles.tableWrap}>
            <table className={adminStyles.table}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Precio</th>
                  <th>Cant.</th>
                  <th>Subtotal</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cart.map((l) => {
                  const pricing = linePricing(l);
                  return (
                    <tr key={l.productId}>
                      <td>
                        <strong>{l.name}</strong>
                        <div className={adminStyles.muted}>
                          #{l.productId} · stock {l.stock}
                          {pricing.promo_applied ? " · promo" : ""}
                          {pricing.discount_percent > 0 && !pricing.promo_applied
                            ? ` · −${pricing.discount_percent}%`
                            : ""}
                        </div>
                      </td>
                      <td>{formatCLP(pricing.unit_price_cents)}</td>
                      <td>
                        <input
                          className={adminStyles.inputSm}
                          type="number"
                          min={1}
                          max={l.stock}
                          value={l.quantity}
                          onChange={(e) => setQty(l.productId, parseInt(e.target.value, 10) || 1)}
                        />
                      </td>
                      <td>{formatCLP(pricing.line_total_cents)}</td>
                      <td>
                        <button type="button" className={adminStyles.btnLink} onClick={() => removeLine(l.productId)}>
                          Quitar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", marginTop: "1rem" }}>
          <strong style={{ fontSize: "1.25rem" }}>Total {formatCLP(total)}</strong>
          <button type="button" className={adminStyles.btnPrimary} disabled={busy || !cart.length} onClick={() => charge("cash")}>
            Cobrar efectivo
          </button>
          <button type="button" className={adminStyles.btn} disabled={busy || !cart.length} onClick={() => charge("card")}>
            Cobrar tarjeta
          </button>
        </div>
      </div>

      {catalogOpen ? (
        <div
          className={`${adminStyles.modalBackdrop} ${adminStyles.modalBackdropHigh}`}
          role="presentation"
          onClick={() => setCatalogOpen(false)}
        >
          <div
            className={adminStyles.modal}
            role="dialog"
            aria-modal="true"
            aria-label="Catálogo de productos"
            style={{ width: "min(920px, 96vw)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ margin: 0 }}>Catálogo</h2>
                <p className={adminStyles.muted} style={{ margin: "0.35rem 0 0" }}>
                  Elige un producto para sumarlo a la venta.
                </p>
              </div>
              <button type="button" className={adminStyles.btn} onClick={() => setCatalogOpen(false)}>
                Cerrar
              </button>
            </div>

            <label className={adminStyles.label} style={{ marginTop: "0.85rem" }}>
              Filtrar
              <input
                ref={catalogSearchRef}
                className={adminStyles.input}
                value={catalogFilter}
                onChange={(e) => setCatalogFilter(e.target.value)}
                placeholder="Nombre, código o ID…"
                autoComplete="off"
              />
            </label>

            {catalogLoading ? <p className={adminStyles.muted}>Cargando catálogo…</p> : null}
            {catalogErr ? <p className={adminStyles.error}>{catalogErr}</p> : null}

            <div
              style={{
                marginTop: "0.75rem",
                overflowY: "auto",
                flex: 1,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: "0.75rem",
                paddingBottom: "0.25rem",
              }}
            >
              {!catalogLoading && filteredCatalog.length === 0 ? (
                <p className={adminStyles.muted} style={{ gridColumn: "1 / -1" }}>
                  No hay productos con stock que coincidan.
                </p>
              ) : null}
              {filteredCatalog.map((p) => {
                const img = resolveStoreMediaUrl(p.image_url);
                const unit = effectiveLinePricing(p, 1).unit_price_cents;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickFromCatalog(p)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "stretch",
                      textAlign: "left",
                      gap: "0.45rem",
                      padding: "0.55rem",
                      border: "1px solid #ddd",
                      borderRadius: 6,
                      background: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "1",
                        borderRadius: 4,
                        background: "#f3f3f3",
                        border: "1px solid #eee",
                        overflow: "hidden",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      {img ? (
                        <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span className={adminStyles.muted}>Sin imagen</span>
                      )}
                    </div>
                    <div style={{ fontWeight: 650, fontSize: "0.92rem", lineHeight: 1.25 }}>{p.name}</div>
                    <div className={adminStyles.muted} style={{ fontSize: "0.82rem" }}>
                      #{p.id}
                      {p.barcode ? ` · ${p.barcode}` : ""}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.35rem", alignItems: "baseline" }}>
                      <strong>{formatCLP(unit)}</strong>
                      <span className={adminStyles.muted}>stock {p.stock}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

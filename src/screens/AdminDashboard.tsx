import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCLP } from "../lib/money";
import { parseResponseJson } from "../lib/parseResponseJson";
import adminStyles from "../admin/admin.module.css";

type Stats = {
  usersTotal: number;
  customersCount: number;
  adminsCount: number;
  productsTotal: number;
  productsActive: number;
  lowStockCount: number;
  outOfStockCount: number;
  cartLineItems: number;
  cartSessions: number;
  cartUnits: number;
  cartValueCents: number;
  lowStockByMin?: number;
  minStockAlerts?: Array<{ id: number; name: string; stock: number; min_stock: number }>;
};

type DayPoint = { day: string; revenue: number; profit: number; orders: number };
type LabelRow = {
  category: string;
  subcategory: string;
  investment: number;
  revenue: number;
  cost_sold: number;
  qty_sold: number;
  profit: number;
};

type Finance = {
  from: string;
  to: string;
  invested: number;
  revenue: number;
  profit: number;
  cost_sold: number;
  sale_count: number;
  by_day: DayPoint[];
  by_label: LabelRow[];
  filters: {
    products: Array<{ id: number; name: string }>;
    categories: string[];
    subcategories: string[];
  };
};

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayIso() {
  return isoDaysAgo(0);
}

function BarChart({
  points,
  valueKey,
  color,
  height = 160,
}: {
  points: DayPoint[];
  valueKey: "revenue" | "profit";
  color: string;
  height?: number;
}) {
  const max = Math.max(1, ...points.map((p) => Math.abs(Number(p[valueKey]) || 0)));
  const w = Math.max(320, points.length * 28);
  const pad = 8;
  const barW = Math.max(8, (w - pad * 2) / Math.max(1, points.length) - 4);

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={w} height={height + 28} role="img" aria-label="Gráfico">
        {points.map((p, i) => {
          const v = Number(p[valueKey]) || 0;
          const h = Math.round((Math.abs(v) / max) * height);
          const x = pad + i * (barW + 4);
          const y = height - h + 4;
          return (
            <g key={p.day}>
              <rect x={x} y={y} width={barW} height={Math.max(2, h)} fill={color} rx={3} opacity={v < 0 ? 0.45 : 0.9} />
              {points.length <= 14 ? (
                <text x={x + barW / 2} y={height + 18} textAnchor="middle" fontSize="9" fill="#666">
                  {p.day.slice(5)}
                </text>
              ) : null}
              <title>
                {p.day}: {formatCLP(v)} · {p.orders} venta(s)
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function CompareBars({ invested, revenue, profit }: { invested: number; revenue: number; profit: number }) {
  const max = Math.max(1, invested, revenue, Math.abs(profit));
  const rows = [
    { label: "Invirtió", value: invested, color: "#5bc0de" },
    { label: "Recuperó", value: revenue, color: "#337ab7" },
    { label: "Ganancia", value: profit, color: profit >= 0 ? "#4caf50" : "#e57373" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
      {rows.map((r) => (
        <div key={r.label}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: 4 }}>
            <span>{r.label}</span>
            <strong>{formatCLP(r.value)}</strong>
          </div>
          <div style={{ height: 14, background: "#e9ecef", borderRadius: 8, overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.min(100, (Math.abs(r.value) / max) * 100)}%`,
                height: "100%",
                background: r.color,
                borderRadius: 8,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function InventoryMovementsPanel() {
  const [rows, setRows] = useState<
    Array<{
      id: number;
      product_id: number;
      delta: number;
      reason: string;
      note?: string | null;
      order_id?: number | null;
      stock_after?: number | null;
      createdAt?: string;
    }>
  >([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/store/admin/inventory/movements?limit=30", { credentials: "include" });
        const data = await parseResponseJson<{ error?: string; movements?: typeof rows }>(res);
        if (!res.ok) throw new Error(data.error || "No se pudieron cargar movimientos");
        if (!cancelled) setRows(Array.isArray(data.movements) ? data.movements : []);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={adminStyles.panelCard} style={{ marginTop: "1.25rem" }}>
      <h2>Últimos movimientos de inventario</h2>
      {loading ? <p className={adminStyles.muted}>Cargando…</p> : null}
      {err ? <p className={adminStyles.error}>{err}</p> : null}
      {!loading && !err && rows.length === 0 ? (
        <p className={adminStyles.muted}>Aún no hay movimientos registrados.</p>
      ) : null}
      {rows.length > 0 ? (
        <div className={adminStyles.tableWrap}>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Producto</th>
                <th>Δ</th>
                <th>Stock</th>
                <th>Motivo</th>
                <th>Orden</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>{m.id}</td>
                  <td>#{m.product_id}</td>
                  <td style={{ color: m.delta < 0 ? "#c62828" : "#2e7d32", fontWeight: 600 }}>
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </td>
                  <td>{m.stock_after ?? "—"}</td>
                  <td>
                    {m.reason}
                    {m.note ? ` · ${m.note}` : ""}
                  </td>
                  <td>{m.order_id ?? "—"}</td>
                  <td>{m.createdAt ? new Date(m.createdAt).toLocaleString("es-CL") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

type OpsSummary = {
  orders_today: number;
  revenue_today_cents: number;
  pending_pickup: number;
  pending_shipping: number;
  low_stock: number;
  out_of_stock: number;
};

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [ops, setOps] = useState<OpsSummary | null>(null);
  const [finance, setFinance] = useState<Finance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finErr, setFinErr] = useState<string | null>(null);
  const [from, setFrom] = useState(isoDaysAgo(7));
  const [to, setTo] = useState(todayIso());
  const [productId, setProductId] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);

  async function exportProductsCsv() {
    setExportMsg(null);
    setExportErr(null);
    try {
      const res = await fetch("/api/store/admin/products/export.csv", { credentials: "include" });
      if (!res.ok) {
        const data = await parseResponseJson<{ error?: string }>(res).catch(() => ({} as { error?: string }));
        throw new Error(data.error || "No se pudo exportar el CSV.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "productos.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportMsg("CSV descargado.");
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : "Error al exportar.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/store/admin/stats", { credentials: "include" });
        const data = await parseResponseJson<{ error?: string; stats?: Stats }>(res);
        if (!res.ok) throw new Error(data.error || "Error al cargar estadísticas");
        if (!cancelled) setStats(data.stats ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      }
    })();
    fetch("/api/store/admin/ops-summary", { credentials: "include" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!cancelled && ok && j?.ok) setOps(j.summary || null);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadFinance = useCallback(async () => {
    setBusy(true);
    setFinErr(null);
    try {
      const q = new URLSearchParams();
      q.set("from", from);
      q.set("to", to);
      if (productId) q.set("product_id", productId);
      if (category) q.set("category", category);
      if (subcategory) q.set("subcategory", subcategory);
      const res = await fetch(`/api/store/admin/finance?${q}`, { credentials: "include" });
      const data = await parseResponseJson<{ error?: string; finance?: Finance }>(res);
      if (!res.ok || !data.finance) throw new Error(data.error || "No se pudo cargar finanzas");
      setFinance(data.finance);
    } catch (e) {
      setFinErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }, [from, to, productId, category, subcategory]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  const topLabels = useMemo(() => (finance?.by_label || []).slice(0, 8), [finance]);
  const minAlerts = stats?.minStockAlerts || [];
  const hasMinAlerts = minAlerts.length > 0 || (stats?.lowStockByMin ?? 0) > 0;

  return (
    <div>
      <h1 className={adminStyles.pageTitle}>Panel de inicio</h1>
      {ops ? (
        <div className={adminStyles.statsGrid} style={{ marginBottom: "1rem" }}>
          <div className={adminStyles.statCard}>
            <div className={adminStyles.statLabel}>Ventas hoy</div>
            <div className={adminStyles.statValue}>{ops.orders_today}</div>
            <div className={adminStyles.statHint}>{formatCLP(ops.revenue_today_cents)}</div>
          </div>
          <div className={adminStyles.statCard}>
            <div className={adminStyles.statLabel}>Retiros pendientes</div>
            <div className={adminStyles.statValue}>{ops.pending_pickup}</div>
          </div>
          <div className={adminStyles.statCard}>
            <div className={adminStyles.statLabel}>Envíos activos</div>
            <div className={adminStyles.statValue}>{ops.pending_shipping}</div>
          </div>
          <div className={adminStyles.statCard}>
            <div className={adminStyles.statLabel}>Stock crítico</div>
            <div className={adminStyles.statValue}>{ops.low_stock}</div>
            <div className={adminStyles.statHint}>Sin stock: {ops.out_of_stock}</div>
          </div>
        </div>
      ) : null}
      <p className={adminStyles.pageLead}>
        Resumen de la tienda, inversión en stock y recuperación por ventas (web + caja).
      </p>

      <div className={adminStyles.toolbar} style={{ marginBottom: "1rem" }}>
        <button type="button" className={adminStyles.btn} onClick={() => void exportProductsCsv()}>
          Exportar productos CSV
        </button>
      </div>
      {exportMsg ? <p className={adminStyles.banner}>{exportMsg}</p> : null}
      {exportErr ? <p className={adminStyles.error}>{exportErr}</p> : null}

      {error && <p className={adminStyles.error}>{error}</p>}

      {!stats && !error && <p className={adminStyles.muted}>Cargando datos…</p>}

      {stats && (
        <div className={adminStyles.statsGrid}>
          <div className={adminStyles.statCard}>
            <div className={adminStyles.statLabel}>Clientes registrados</div>
            <div className={adminStyles.statValue}>{stats.customersCount}</div>
            <div className={adminStyles.statHint}>Total usuarios: {stats.usersTotal}</div>
          </div>
          <div className={adminStyles.statCard}>
            <div className={adminStyles.statLabel}>Productos activos</div>
            <div className={adminStyles.statValue}>{stats.productsActive}</div>
            <div className={adminStyles.statHint}>En catálogo (todos): {stats.productsTotal}</div>
          </div>
          <div className={adminStyles.statCard}>
            <div className={adminStyles.statLabel}>Stock bajo (&lt;10)</div>
            <div className={adminStyles.statValue}>{stats.lowStockCount}</div>
            <div className={adminStyles.statHint}>Sin stock: {stats.outOfStockCount}</div>
          </div>
          <div className={adminStyles.statCard}>
            <div className={adminStyles.statLabel}>Bajo stock mínimo</div>
            <div className={adminStyles.statValue}>{stats.lowStockByMin ?? minAlerts.length}</div>
            <div className={adminStyles.statHint}>Según min_stock del producto</div>
          </div>
          <div className={adminStyles.statCard}>
            <div className={adminStyles.statLabel}>Carritos con ítems</div>
            <div className={adminStyles.statValue}>{stats.cartSessions}</div>
            <div className={adminStyles.statHint}>
              {stats.cartLineItems} líneas · {stats.cartUnits} unidades
            </div>
          </div>
          <div className={adminStyles.statCard}>
            <div className={adminStyles.statLabel}>Valor en carritos</div>
            <div className={adminStyles.statValue}>{formatCLP(stats.cartValueCents)}</div>
            <div className={adminStyles.statHint}>Suma de precio × cantidad</div>
          </div>
          <div className={adminStyles.statCard}>
            <div className={adminStyles.statLabel}>Administradores</div>
            <div className={adminStyles.statValue}>{stats.adminsCount}</div>
            <div className={adminStyles.statHint}>Cuentas con rol admin</div>
          </div>
        </div>
      )}

      {stats && hasMinAlerts ? (
        <div className={adminStyles.panelCard} style={{ marginTop: "1.25rem" }}>
          <h2>Alertas de stock mínimo</h2>
          <p className={adminStyles.muted} style={{ marginTop: 0 }}>
            Productos con stock menor o igual a su mínimo configurado
            {stats.lowStockByMin != null ? ` (${stats.lowStockByMin})` : ""}.
          </p>
          {minAlerts.length === 0 ? (
            <p className={adminStyles.muted}>Hay productos bajo mínimo, pero el listado detallado no vino en la API.</p>
          ) : (
            <div className={adminStyles.tableWrap}>
              <table className={adminStyles.table}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Producto</th>
                    <th>Stock</th>
                    <th>Mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {minAlerts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.id}</td>
                      <td>{a.name}</td>
                      <td style={{ color: "#c62828", fontWeight: 600 }}>{a.stock}</td>
                      <td>{a.min_stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      <InventoryMovementsPanel />

      <div className={adminStyles.panelCard} style={{ marginTop: "1.25rem" }}>
        <h2>Filtros</h2>
        <div className={adminStyles.formGrid}>
          <label className={adminStyles.label}>
            Desde
            <input className={adminStyles.input} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className={adminStyles.label}>
            Hasta
            <input className={adminStyles.input} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className={adminStyles.label}>
            Producto
            <select className={adminStyles.input} value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Todos los productos</option>
              {(finance?.filters.products || []).map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.id} — {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={adminStyles.label}>
            Etiqueta
            <select className={adminStyles.input} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todas las etiquetas</option>
              {(finance?.filters.categories || []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className={adminStyles.label}>
            Subetiqueta
            <select className={adminStyles.input} value={subcategory} onChange={(e) => setSubcategory(e.target.value)}>
              <option value="">Todas las subetiquetas</option>
              {(finance?.filters.subcategories || []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={adminStyles.modalActions} style={{ borderTop: "none", paddingTop: "0.75rem" }}>
          <button type="button" className={adminStyles.btn} disabled={busy} onClick={() => void loadFinance()}>
            {busy ? "Actualizando…" : "Aplicar filtros"}
          </button>
          <button
            type="button"
            className={adminStyles.btn}
            disabled={busy}
            onClick={() => {
              setFrom(isoDaysAgo(7));
              setTo(todayIso());
              setProductId("");
              setCategory("");
              setSubcategory("");
            }}
          >
            Últimos 7 días
          </button>
        </div>
      </div>

      {finErr ? <p className={adminStyles.error}>{finErr}</p> : null}

      {finance ? (
        <div className={adminStyles.panelCard}>
          <h2>Inversión y recuperación</h2>
          <p className={adminStyles.muted} style={{ marginTop: 0 }}>
            Invirtió = valor actual de la mercadería en bodega (stock × costo de compra). Recuperó = dinero que entró
            por ventas en el rango de fechas. Ganancia = lo recuperado − el costo de lo que se vendió.
          </p>

          <div className={adminStyles.statsGrid}>
            <div className={adminStyles.statCard}>
              <div className={adminStyles.statLabel}>Invirtió (stock hoy)</div>
              <div className={adminStyles.statValue}>{formatCLP(finance.invested)}</div>
            </div>
            <div className={adminStyles.statCard}>
              <div className={adminStyles.statLabel}>Recuperó (ventas)</div>
              <div className={adminStyles.statValue}>{formatCLP(finance.revenue)}</div>
            </div>
            <div className={adminStyles.statCard}>
              <div className={adminStyles.statLabel}>Ganancia estimada</div>
              <div className={adminStyles.statValue} style={{ color: finance.profit >= 0 ? "#2e7d32" : "#c62828" }}>
                {formatCLP(finance.profit)}
              </div>
            </div>
          </div>

          <p className={adminStyles.muted}>
            Rango: {finance.from} → {finance.to} · {finance.sale_count} boleta(s) · Costo de lo vendido:{" "}
            {formatCLP(finance.cost_sold)}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1.25rem",
              marginTop: "1rem",
            }}
          >
            <div>
              <div className={adminStyles.subTitle}>Comparativo</div>
              <CompareBars invested={finance.invested} revenue={finance.revenue} profit={finance.profit} />
            </div>
            <div>
              <div className={adminStyles.subTitle}>Ventas por día (recuperó)</div>
              <BarChart points={finance.by_day} valueKey="revenue" color="#337ab7" />
            </div>
            <div>
              <div className={adminStyles.subTitle}>Ganancia por día</div>
              <BarChart points={finance.by_day} valueKey="profit" color="#4caf50" />
            </div>
          </div>

          <div className={adminStyles.subTitle} style={{ marginTop: "1.25rem" }}>
            Desglose por etiqueta / subetiqueta
          </div>
          {topLabels.length === 0 ? (
            <p className={adminStyles.muted}>Sin datos de etiquetas (asigna categoría/subcategoría al crear productos).</p>
          ) : (
            <>
              <div style={{ overflowX: "auto", marginBottom: "0.75rem" }}>
                <svg width={Math.max(360, topLabels.length * 56)} height={180} role="img" aria-label="Por etiqueta">
                  {(() => {
                    const max = Math.max(1, ...topLabels.map((r) => Math.max(r.investment, r.revenue)));
                    const barW = 18;
                    return topLabels.map((r, i) => {
                      const x0 = 24 + i * 56;
                      const hInv = Math.round((r.investment / max) * 130);
                      const hRev = Math.round((r.revenue / max) * 130);
                      return (
                        <g key={`${r.category}-${r.subcategory}-${i}`}>
                          <rect x={x0} y={140 - hInv} width={barW} height={Math.max(2, hInv)} fill="#5bc0de" rx={2} />
                          <rect x={x0 + barW + 3} y={140 - hRev} width={barW} height={Math.max(2, hRev)} fill="#337ab7" rx={2} />
                          <text x={x0 + barW} y={158} textAnchor="middle" fontSize="8" fill="#666">
                            {(r.category || "").slice(0, 8)}
                          </text>
                          <title>
                            {r.category} / {r.subcategory}: inv {formatCLP(r.investment)} · ventas {formatCLP(r.revenue)}
                          </title>
                        </g>
                      );
                    });
                  })()}
                </svg>
                <div className={adminStyles.muted} style={{ fontSize: "0.8rem" }}>
                  Azul claro = invirtió · Azul = recuperó
                </div>
              </div>
              <div className={adminStyles.tableWrap}>
                <table className={adminStyles.table}>
                  <thead>
                    <tr>
                      <th>Etiqueta</th>
                      <th>Subetiqueta</th>
                      <th>Invirtió</th>
                      <th>Recuperó</th>
                      <th>Ganancia</th>
                      <th>Ud. vendidas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finance.by_label.map((r) => (
                      <tr key={`${r.category}|${r.subcategory}`}>
                        <td>{r.category}</td>
                        <td>{r.subcategory}</td>
                        <td>{formatCLP(r.investment)}</td>
                        <td>{formatCLP(r.revenue)}</td>
                        <td style={{ color: r.profit >= 0 ? "#2e7d32" : "#c62828" }}>{formatCLP(r.profit)}</td>
                        <td>{r.qty_sold}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

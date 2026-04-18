import { useEffect, useState } from "react";
import { formatCLP } from "../lib/money";
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
};

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/store/admin/stats", { credentials: "include" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al cargar estadísticas");
        if (!cancelled) setStats(data.stats);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1 className={adminStyles.pageTitle}>Panel de inicio</h1>
      <p className={adminStyles.pageLead}>
        Resumen de la tienda (estilo panel clásico): clientes, catálogo, inventario y carritos
        abandonados o en curso.
      </p>

      {error && <p className={adminStyles.error}>{error}</p>}

      {!stats && !error && <p className={adminStyles.muted}>Cargando datos…</p>}

      {stats && (
        <>
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

          <div className={adminStyles.panelCard}>
            <h2>Actividad reciente</h2>
            <p className={adminStyles.muted}>
              En esta demo no hay pedidos ni historial de compras; los carritos activos reflejan lo que
              los clientes tienen guardado ahora. Revisa la sección <strong>Carritos activos</strong> para
              vaciar o ajustar cantidades.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

import { useEffect } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { APP_VERSION_LABEL } from "../lib/appVersion";
import adminStyles from "../admin/admin.module.css";
import { AdminPosSale } from "./AdminPosSale";

/** POS a pantalla completa en ventana propia (ruta /admin/pos). */
export function AdminPosPage() {
  const { user, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    document.title = "POS · Plasma Store";
    document.documentElement.setAttribute("data-shell", "admin");
    return () => {
      document.documentElement.removeAttribute("data-shell");
      document.title = "Plasma Store";
    };
  }, []);

  if (loading) {
    return (
      <div className={adminStyles.root} style={{ padding: "2rem" }}>
        <p className={adminStyles.muted}>Cargando caja…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user.role !== "admin" && user.role !== "staff") {
    return <Navigate to="/catalogo" replace />;
  }

  return (
    <div className={adminStyles.root} style={{ minHeight: "100vh" }}>
      <header className={adminStyles.posPageHeader}>
        <div>
          <strong style={{ fontSize: "1rem" }}>Plasma Store · POS</strong>
          <span className={adminStyles.muted} style={{ marginLeft: "0.65rem", color: "#94a3b8" }}>
            {APP_VERSION_LABEL}
          </span>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <Link to="/admin/panel" style={{ color: "#7dd3fc", fontSize: "0.9rem" }}>
            Panel
          </Link>
          <Link to="/" style={{ color: "#7dd3fc", fontSize: "0.9rem" }}>
            Tienda
          </Link>
        </div>
      </header>
      <main className={adminStyles.posPageMain}>
        <AdminPosSale />
      </main>
    </div>
  );
}

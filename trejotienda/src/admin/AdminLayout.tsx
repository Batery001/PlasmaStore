import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AdminTournamentBell } from "./AdminTournamentBell";
import styles from "./admin.module.css";

export function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className={styles.root}>
        <p className={styles.muted} style={{ padding: "2rem" }}>
          Cargando panel…
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user.role !== "admin") {
    return <Navigate to="/catalogo" replace />;
  }

  return (
    <div className={styles.root}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>Plasma Store</div>
        <div className={styles.subbrand}>Panel de administración</div>
        <nav className={styles.nav}>
          <div className={styles.navSection}>General</div>
          <NavLink
            to="/admin/panel"
            end
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            Panel de inicio
          </NavLink>
          <div className={styles.navSection}>Catálogo</div>
          <NavLink
            to="/admin/productos"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            Productos
          </NavLink>
          <NavLink
            to="/admin/widgets"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            Widgets
          </NavLink>
          <div className={styles.navSection}>Ventas</div>
          <NavLink
            to="/admin/carritos"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            Carritos activos
          </NavLink>
          <div className={styles.navSection}>Torneos</div>
          <NavLink
            to="/admin/torneos-sprites"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            Sprites y listas
          </NavLink>
        </nav>
        <div className={styles.sidebarFooter}>
          <a href={`${import.meta.env.BASE_URL}`}>← Volver a la tienda</a>
          <button type="button" className={styles.linkbtn} onClick={() => logout()}>
            Cerrar sesión
          </button>
        </div>
      </aside>
      <div className={styles.mainWrap}>
        <header className={styles.topbar}>
          <div className={styles.topbarInner}>
            <span>
              Administración · {user.name} ({user.email})
            </span>
            <AdminTournamentBell />
          </div>
        </header>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

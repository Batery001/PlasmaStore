import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import styles from "./admin.module.css";

function routeLabel(pathname: string) {
  if (pathname.startsWith("/admin/productos")) return "Productos";
  if (pathname.startsWith("/admin/singles")) return "Singles";
  if (pathname.startsWith("/admin/etiquetas")) return "Etiquetas";
  if (pathname.startsWith("/admin/widgets")) return "Widgets";
  if (pathname.startsWith("/admin/carritos")) return "Carritos";
  if (pathname.startsWith("/admin/ordenes")) return "Órdenes";
  if (pathname.startsWith("/admin/torneos-sprites")) return "Torneos · sprites y listas";
  return "Panel de inicio";
}

export function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const current = routeLabel(location.pathname);

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
            <span className={styles.navIcon}>🏠</span> Panel de inicio
          </NavLink>
          <div className={styles.navSection}>Catálogo</div>
          <NavLink
            to="/admin/productos"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            <span className={styles.navIcon}>🛒</span> Productos
          </NavLink>
          <NavLink
            to="/admin/singles"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            <span className={styles.navIcon}>🃏</span> Singles
          </NavLink>
          <NavLink
            to="/admin/etiquetas"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            <span className={styles.navIcon}>🏷️</span> Etiquetas
          </NavLink>
          <NavLink
            to="/admin/widgets"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            <span className={styles.navIcon}>🧩</span> Widgets
          </NavLink>
          <div className={styles.navSection}>Ventas</div>
          <NavLink
            to="/admin/carritos"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            <span className={styles.navIcon}>🧺</span> Carritos activos
          </NavLink>
          <NavLink
            to="/admin/ordenes"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            <span className={styles.navIcon}>📦</span> Órdenes
          </NavLink>
          <div className={styles.navSection}>Torneos</div>
          <NavLink
            to="/admin/torneos-sprites"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            <span className={styles.navIcon}>🏆</span> Sprites y listas
          </NavLink>
        </nav>
        <div className={styles.sidebarFooter}>
          <a href="/">← Volver a la tienda</a>
          <button type="button" className={styles.linkbtn} onClick={() => logout()}>
            Cerrar sesión
          </button>
        </div>
      </aside>
      <div className={styles.mainWrap}>
        <header className={styles.topbar}>
          <div className={styles.topbarInner}>
            <nav className={styles.breadcrumb} aria-label="Breadcrumb">
              <a className={styles.crumbLink} href="/admin/panel">
                Dashboard
              </a>
              <span className={styles.crumbSep}>/</span>
              <span>{current}</span>
            </nav>
            <div className={styles.topbarRight}>
              <span className={styles.topbarUser}>
                {user.name} ({user.email})
              </span>
              <a className={styles.topbarBtn} href="/" title="Ver tienda">
                Tienda
              </a>
              <button type="button" className={styles.topbarBtn} onClick={() => logout()}>
                Salir
              </button>
            </div>
          </div>
        </header>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { useEffect } from "react";
import { Link, NavLink, Outlet, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { APP_VERSION_LABEL } from "../lib/appVersion";
import { usePosPopup } from "../pos/PosPopupContext";
import styles from "./admin.module.css";

function routeLabel(pathname: string) {
  if (pathname.startsWith("/admin/productos")) return "Productos";
  if (pathname.startsWith("/admin/sitio")) return "Sitio / redes";
  if (pathname.startsWith("/admin/etiquetas")) return "Etiquetas";
  if (pathname.startsWith("/admin/widgets")) return "Widgets";
  if (pathname.startsWith("/admin/carritos")) return "Carritos";
  if (pathname.startsWith("/admin/ordenes")) return "Órdenes";
  if (pathname.startsWith("/admin/pagos")) return "Sistema de pago";
  if (pathname.startsWith("/admin/envio")) return "Envío / retiro";
  if (pathname.startsWith("/admin/correo")) return "Correo";
  if (pathname.startsWith("/admin/ops")) return "Operación";
  return "Panel de inicio";
}

export function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const current = routeLabel(location.pathname);
  const pos = usePosPopup();

  useEffect(() => {
    document.documentElement.setAttribute("data-shell", "admin");
    return () => {
      document.documentElement.removeAttribute("data-shell");
    };
  }, []);

  useEffect(() => {
    if (location.pathname.startsWith("/admin/venta")) {
      pos.show();
      navigate("/admin/panel", { replace: true });
    }
  }, [location.pathname, navigate, pos.show]);

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
        <div className={styles.brandBlock}>
          <div className={styles.brand}>Plasma Store</div>
          <div className={styles.subbrand}>Administración</div>
        </div>
        <nav className={styles.nav} aria-label="Menú administración">
          <div className={styles.navSection}>General</div>
          <NavLink
            to="/admin/panel"
            end
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            Panel
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
            to="/admin/sitio"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            Sitio / redes
          </NavLink>
          <NavLink
            to="/admin/etiquetas"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            Etiquetas
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
          <button
            type="button"
            className={pos.open ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
            onClick={() => pos.show()}
            style={{ width: "100%", textAlign: "left", cursor: "pointer", border: "none", background: "transparent" }}
          >
            POS
          </button>
          <NavLink
            to="/admin/carritos"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            Carritos activos
          </NavLink>
          <NavLink
            to="/admin/ordenes"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            Órdenes
          </NavLink>
          <div className={styles.navSection}>Sistema</div>
          <NavLink
            to="/admin/pagos"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            Sistema de pago
          </NavLink>
          <NavLink
            to="/admin/envio"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            Envío / retiro
          </NavLink>
          <NavLink
            to="/admin/correo"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            Correo
          </NavLink>
          <NavLink
            to="/admin/ops"
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            Operación / 2FA
          </NavLink>
        </nav>
        <div className={styles.sidebarFooter}>
          <button type="button" className={styles.linkbtnAccent} onClick={() => pos.show()}>
            POS
          </button>
          <Link to="/">Ver tienda</Link>
          <button type="button" className={styles.linkbtn} onClick={() => logout()}>
            Cerrar sesión
          </button>
          <span className={styles.versionLabel}>{APP_VERSION_LABEL}</span>
        </div>
      </aside>
      <div className={styles.mainWrap}>
        <header className={styles.topbar}>
          <div className={styles.topbarInner}>
            <nav className={styles.breadcrumb} aria-label="Breadcrumb">
              <Link className={styles.crumbLink} to="/admin/panel">
                Dashboard
              </Link>
              <span className={styles.crumbSep}>/</span>
              <span>{current}</span>
            </nav>
            <div className={styles.topbarRight}>
              <button type="button" className={styles.topbarBtn} onClick={() => pos.show()} title="Abrir POS">
                POS
              </button>
              <span className={styles.topbarVersion} title="Versión">
                {APP_VERSION_LABEL}
              </span>
              <span className={styles.topbarUser}>
                {user.name} · {user.email}
              </span>
              <Link className={styles.topbarBtn} to="/" title="Ver tienda">
                Tienda
              </Link>
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

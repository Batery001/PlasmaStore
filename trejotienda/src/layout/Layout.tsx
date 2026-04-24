import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import styles from "./layout.module.css";

export function Layout() {
  const { user, loading, logout } = useAuth();

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/catalogo" className={styles.brand}>
          Plasma Store
        </Link>
        <nav className={styles.nav}>
          <Link to="/catalogo">Catálogo</Link>
          <Link to="/torneos">Torneos</Link>
          <Link to="/carrito">Carrito</Link>
          {user?.role === "admin" && <Link to="/admin">Administración</Link>}
          {loading ? (
            <span className={styles.muted}>…</span>
          ) : user ? (
            <>
              <span className={styles.user}>
                {user.name}
                {user.role === "admin" ? " · admin" : ""}
              </span>
              <button type="button" className={styles.linkbtn} onClick={() => logout()}>
                Salir
              </button>
            </>
          ) : (
            <>
              <Link to="/login">Entrar</Link>
              <Link to="/registro">Registro</Link>
            </>
          )}
        </nav>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        Plasma Store · catálogo, torneos y carrito · precios en CLP (demo).
      </footer>
    </div>
  );
}

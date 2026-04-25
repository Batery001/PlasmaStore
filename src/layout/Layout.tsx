import { Link, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { PlasmaOrbLogo } from "./PlasmaOrbLogo";
import { CartNavIcon } from "./CartNavIcon";
import styles from "./layout.module.css";

type StoreTag = { id: number; name: string; slug: string; order?: number };

export function Layout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const [tags, setTags] = useState<StoreTag[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/store/tags", { credentials: "include" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (!ok || !j?.ok) return;
        const list = Array.isArray(j.tags) ? j.tags : [];
        setTags(list);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className={styles.shell}>
      <header className={`${styles.header} ${isLanding ? styles.headerCosmic : ""}`}>
        <Link to="/" className={styles.brandRow}>
          <PlasmaOrbLogo className={styles.brandOrb} />
          <span className={styles.brandText}>Plasma Store</span>
        </Link>
        <nav className={`${styles.nav} ${isLanding ? styles.navCosmic : ""}`}>
          {isLanding ? (
            <>
              <div className={styles.navDrop}>
                <Link to="/catalogo" className={styles.navDropTrigger}>
                  Productos <span className={styles.navDropChev}>▾</span>
                </Link>
                <div className={styles.navDropPanel}>
                  {tags.length === 0 ? (
                    <div className={styles.navDropEmpty}>Sin etiquetas aún. Agrega desde Admin → Etiquetas.</div>
                  ) : (
                    <div className={styles.navDropGrid}>
                      {tags.map((t) => (
                        <Link key={t.id} to={`/catalogo?tag=${encodeURIComponent(t.slug)}`} className={styles.navDropItem}>
                          <span>{t.name}</span>
                          <span className={styles.navDropHint}>ver</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <Link to="/singles">Singles</Link>
              <Link to="/torneos">Torneos</Link>
              {loading ? (
                <span className={styles.muted}>…</span>
              ) : user ? (
                <>
                  <Link
                    to="/catalogo"
                    className={styles.navMiCuenta}
                    title={`${user.name}${user.role === "admin" ? " · admin" : ""}`}
                  >
                    Mi cuenta
                  </Link>
                  <Link to="/carrito" className={styles.navCart}>
                    Carrito <CartNavIcon className={styles.navCartIcon} />
                  </Link>
                  <button type="button" className={styles.linkbtn} onClick={() => logout()}>
                    Salir
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login">Entrar</Link>
                  <Link to="/carrito" className={styles.navCart}>
                    Carrito <CartNavIcon className={styles.navCartIcon} />
                  </Link>
                </>
              )}
              {user?.role === "admin" && <Link to="/admin">Administración</Link>}
            </>
          ) : (
            <>
              <div className={styles.navDrop}>
                <Link to="/catalogo" className={styles.navDropTrigger}>
                  Productos <span className={styles.navDropChev}>▾</span>
                </Link>
                <div className={styles.navDropPanel}>
                  {tags.length === 0 ? (
                    <div className={styles.navDropEmpty}>Sin etiquetas aún.</div>
                  ) : (
                    <div className={styles.navDropGrid}>
                      {tags.map((t) => (
                        <Link key={t.id} to={`/catalogo?tag=${encodeURIComponent(t.slug)}`} className={styles.navDropItem}>
                          <span>{t.name}</span>
                          <span className={styles.navDropHint}>ver</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <Link to="/singles">Singles</Link>
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
                <Link to="/login">Entrar</Link>
              )}
            </>
          )}
        </nav>
      </header>
      <main className={isLanding ? styles.mainLanding : styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        Plasma Store · catálogo, torneos y carrito · precios en CLP (demo).
      </footer>
    </div>
  );
}

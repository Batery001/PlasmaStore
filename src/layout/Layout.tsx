import { Link, Outlet, useLocation } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { usePosPopup } from "../pos/PosPopupContext";
import { CART_CHANGED_EVENT } from "../lib/cartEvents";
import { parseResponseJson } from "../lib/parseResponseJson";
import { PlasmaOrbLogo } from "./PlasmaOrbLogo";
import { CartNavIcon } from "./CartNavIcon";
import { HeaderSearch } from "./HeaderSearch";
import { WhatsAppFloat } from "../components/WhatsAppFloat";
import styles from "./layout.module.css";

type StoreTag = { id: number; name: string; slug: string; order?: number };

type SiteFlags = {
  singles_enabled: boolean;
  events_enabled: boolean;
  about_enabled: boolean;
  about_title: string;
  socials: Array<{ key: string; label: string; url: string }>;
};

const SOCIAL_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
};

export function Layout() {
  const { user, loading, logout } = useAuth();
  const pos = usePosPopup();
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const [tags, setTags] = useState<StoreTag[]>([]);
  const [site, setSite] = useState<SiteFlags>({
    singles_enabled: false,
    events_enabled: true,
    about_enabled: true,
    about_title: "Quiénes somos",
    socials: [],
  });
  const [cartCount, setCartCount] = useState(0);

  const refreshCartCount = useCallback(() => {
    fetch("/api/store/cart", { credentials: "include" })
      .then(async (r) => parseResponseJson<{ items?: Array<{ quantity?: number }> }>(r))
      .then((d) => {
        const items = Array.isArray(d.items) ? d.items : [];
        const n = items.reduce((acc, it) => acc + (parseInt(String(it.quantity ?? 0), 10) || 0), 0);
        setCartCount(Math.max(0, n));
      })
      .catch(() => setCartCount(0));
  }, []);

  const needsRut =
    Boolean(user) &&
    user?.role !== "admin" &&
    !user?.rut &&
    location.pathname !== "/perfil" &&
    !location.pathname.startsWith("/login");

  useEffect(() => {
    document.documentElement.setAttribute("data-shell", "store");
    return () => {
      document.documentElement.removeAttribute("data-shell");
    };
  }, []);

  useEffect(() => {
    refreshCartCount();
    const onChange = () => refreshCartCount();
    window.addEventListener(CART_CHANGED_EVENT, onChange);
    window.addEventListener("focus", onChange);
    return () => {
      window.removeEventListener(CART_CHANGED_EVENT, onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [refreshCartCount, user?.id]);

  useEffect(() => {
    let alive = true;
    fetch("/api/store/tags", { credentials: "include" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (!ok || !j?.ok) return;
        const list = Array.isArray(j.tags) ? j.tags : [];
        setTags(list.filter((t: StoreTag) => t.slug !== "singles"));
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/store/site-content")
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive || !ok || !j?.ok) return;
        const socialsObj = j.content?.socials || {};
        const socials: SiteFlags["socials"] = [];
        for (const key of ["facebook", "instagram", "youtube", "whatsapp"]) {
          const row = socialsObj[key];
          if (row?.enabled && row?.url) {
            socials.push({ key, label: SOCIAL_LABELS[key] || key, url: row.url });
          }
        }
        setSite({
          singles_enabled: Boolean(j.content?.singles_enabled),
          events_enabled: j.content?.events?.enabled !== false,
          about_enabled: j.content?.about?.enabled !== false,
          about_title: String(j.content?.about?.title || "Quiénes somos").trim() || "Quiénes somos",
          socials,
        });
      })
      .catch(() => {
        /* defaults */
      });
    return () => {
      alive = false;
    };
  }, []);

  const tagsEmptyMsg = isLanding
    ? "Sin etiquetas aún. Agrégalas desde el panel de administración."
    : "Sin etiquetas aún.";

  return (
    <div className={styles.shell}>
      <header className={`${styles.header} ${isLanding ? styles.headerCosmic : ""}`}>
        <Link to="/" className={styles.brandRow}>
          <PlasmaOrbLogo className={styles.brandOrb} />
          <span className={styles.brandText}>Plasma Store</span>
        </Link>
        <nav className={`${styles.nav} ${isLanding ? styles.navCosmic : ""}`} aria-label="Tienda">
          <div className={styles.navDrop}>
            <Link to="/catalogo" className={styles.navDropTrigger}>
              Productos <span className={styles.navDropChev}>▾</span>
            </Link>
            <div className={styles.navDropPanel}>
              {tags.length === 0 ? (
                <div className={styles.navDropEmpty}>{tagsEmptyMsg}</div>
              ) : (
                <div className={styles.navDropGrid}>
                  {tags.map((t) => (
                    <Link
                      key={t.id}
                      to={`/catalogo?tag=${encodeURIComponent(t.slug)}`}
                      className={styles.navDropItem}
                    >
                      <span>{t.name}</span>
                      <span className={styles.navDropHint}>ver</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
          {site.events_enabled ? <Link to="/eventos">Eventos</Link> : null}
          {site.about_enabled ? <Link to="/quienes-somos">{site.about_title}</Link> : null}
          {site.singles_enabled ? <Link to="/singles">Singles</Link> : null}
          <Link to="/ayuda">Ayuda</Link>
          {loading ? (
            <span className={styles.muted}>…</span>
          ) : user ? (
            <>
              <Link to="/perfil" className={styles.navMiCuenta} title={user.name}>
                Mi cuenta
              </Link>
              <div className={styles.navCartCluster}>
                <Link to="/carrito" className={styles.navCart} aria-label={`Carrito${cartCount > 0 ? `, ${cartCount} ítems` : ""}`}>
                  Carrito <CartNavIcon className={styles.navCartIcon} />
                  {cartCount > 0 ? <span className={styles.navCartBadge}>{cartCount > 99 ? "99+" : cartCount}</span> : null}
                </Link>
                <HeaderSearch cosmic={isLanding} />
              </div>
              {user.role === "admin" || user.role === "staff" ? (
                <>
                  <button
                    type="button"
                    className={styles.navStaff}
                    title="Abrir POS en ventana aparte"
                    onClick={() => pos.show()}
                  >
                    POS
                  </button>
                  {user.role === "admin" ? (
                    <Link to="/admin" className={styles.navStaff}>
                      Panel
                    </Link>
                  ) : (
                    <Link to="/admin/ordenes" className={styles.navStaff}>
                      Órdenes
                    </Link>
                  )}
                </>
              ) : null}
              <button type="button" className={styles.linkbtn} onClick={() => logout()}>
                Salir
              </button>
            </>
          ) : (
            <>
              <Link to="/login">Entrar</Link>
              <div className={styles.navCartCluster}>
                <Link to="/carrito" className={styles.navCart} aria-label={`Carrito${cartCount > 0 ? `, ${cartCount} ítems` : ""}`}>
                  Carrito <CartNavIcon className={styles.navCartIcon} />
                  {cartCount > 0 ? <span className={styles.navCartBadge}>{cartCount > 99 ? "99+" : cartCount}</span> : null}
                </Link>
                <HeaderSearch cosmic={isLanding} />
              </div>
            </>
          )}
        </nav>
      </header>
      <main className={isLanding ? styles.mainLanding : styles.main}>
        {needsRut ? (
          <div className={styles.rutBanner} role="status">
            Completa tu RUT en{" "}
            <Link to="/perfil">Mi cuenta</Link> para evitar cuentas duplicadas y poder comprar.
          </div>
        ) : null}
        <Outlet />
      </main>
      <footer className={styles.footer}>
        {site.socials.length > 0 ? (
          <div className={styles.footerSocials} aria-label="Redes sociales">
            {site.socials.map((s) => (
              <a key={s.key} href={s.url} target="_blank" rel="noreferrer noopener">
                {s.label}
              </a>
            ))}
          </div>
        ) : null}
        <div className={styles.footerLegal}>
          <Link to="/ayuda">Cómo comprar</Link>
          <span aria-hidden>·</span>
          <Link to="/privacidad">Privacidad</Link>
          <span aria-hidden>·</span>
          <Link to="/terminos">Términos</Link>
          <span aria-hidden>·</span>
          <Link to="/cookies">Cookies</Link>
          <span aria-hidden>·</span>
          <Link to="/devoluciones">Devoluciones</Link>
        </div>
        <div className={styles.footerCredit}>
          Copyright © {new Date().getFullYear()} Plasma Store | Diseñada por Sebastian Vasquez
        </div>
      </footer>
      <WhatsAppFloat />
    </div>
  );
}

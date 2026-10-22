import { lazy, Suspense, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { usePosPopup } from "./PosPopupContext";
import styles from "./posPopup.module.css";

const AdminPosSale = lazy(() => import("../screens/AdminPosSale").then((m) => ({ default: m.AdminPosSale })));

export function PosPopupHost() {
  const { user } = useAuth();
  const { open, minimized, everOpened, show, hide, minimize } = usePosPopup();

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") minimize();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, minimize]);

  if (!user || user.role !== "admin") return null;

  return (
    <>
      {everOpened ? (
        <div className={open ? styles.backdrop : styles.hiddenHost} role="presentation">
          <div className={styles.window} role="dialog" aria-modal={open} aria-label="POS · caja">
            <div className={styles.titleBar}>
              <div>
                <strong>POS · caja</strong>
                <span className={styles.hint}>Minimiza para seguir navegando; el carrito se conserva.</span>
              </div>
              <div className={styles.titleActions}>
                <button type="button" className={styles.iconBtn} onClick={() => minimize()} title="Minimizar">
                  —
                </button>
                <button type="button" className={styles.iconBtn} onClick={() => hide()} title="Cerrar">
                  ×
                </button>
              </div>
            </div>
            <div className={styles.body}>
              <Suspense fallback={<p className={styles.loading}>Cargando caja…</p>}>
                <AdminPosSale embedded />
              </Suspense>
            </div>
          </div>
        </div>
      ) : null}

      {!open ? (
        <button type="button" className={styles.fab} onClick={() => show()} title="Abrir POS">
          POS
          {minimized ? <span className={styles.fabDot} /> : null}
        </button>
      ) : null}
    </>
  );
}

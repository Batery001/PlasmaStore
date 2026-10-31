import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { openPosWindow } from "./openPosWindow";
import styles from "./posPopup.module.css";

/** Botón flotante: abre el POS en ventana aparte (ya no es modal encima de la tienda). */
export function PosPopupHost() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user || (user.role !== "admin" && user.role !== "staff")) return null;
  if (location.pathname.startsWith("/admin/pos")) return null;

  return (
    <button
      type="button"
      className={styles.fab}
      onClick={() => openPosWindow()}
      title="Abrir POS en ventana aparte"
    >
      POS
    </button>
  );
}

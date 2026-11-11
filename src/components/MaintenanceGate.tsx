import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { parseResponseJson } from "../lib/parseResponseJson";
import { MaintenanceCover } from "./MaintenanceCover";
import styles from "./maintenanceCover.module.css";

const ALLOWED_PREFIXES = [
  "/login",
  "/registro",
  "/perfil",
  "/mazos",
  "/olvide-password",
  "/recuperar",
  "/verificar-email",
  "/ayuda",
  "/privacidad",
  "/terminos",
  "/cookies",
  "/devoluciones",
  "/webpay/return",
  "/tuu/return",
];

function pathAllowed(pathname: string) {
  return ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState(
    "Estamos haciendo arreglos en la página. Volvemos pronto con la tienda online."
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/store/maintenance")
      .then(async (r) => parseResponseJson<{ ok?: boolean; enabled?: boolean; message?: string }>(r))
      .then((d) => {
        if (!alive) return;
        setEnabled(Boolean(d.enabled));
        if (d.message) setMessage(String(d.message));
        setReady(true);
      })
      .catch(() => {
        if (alive) {
          setEnabled(false);
          setReady(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [location.pathname]);

  const isStaff = user?.role === "admin" || user?.role === "staff";

  if (!ready || loading) return <>{children}</>;

  if (enabled && isStaff) {
    return (
      <>
        <div className={styles.staffBanner} role="status">
          Modo mantenimiento activo para el público · la compra online está pausada · podés desactivarlo en Admin →
          Operación
        </div>
        {children}
      </>
    );
  }

  if (enabled && !pathAllowed(location.pathname)) {
    return <MaintenanceCover message={message} />;
  }

  return <>{children}</>;
}

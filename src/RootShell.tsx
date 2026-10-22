"use client";

import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { PosPopupProvider } from "./pos/PosPopupContext";
import { PosPopupHost } from "./pos/PosPopupHost";
import App from "./App";

function basename(): string | undefined {
  const b = process.env.NEXT_PUBLIC_BASE_PATH;
  if (b == null || b === "" || b === "/") return undefined;
  return b.endsWith("/") ? b.slice(0, -1) : b;
}

function BootFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        margin: 0,
        background:
          "radial-gradient(800px 420px at 20% -10%, rgba(91,33,182,0.35), transparent 55%), #050308",
        color: "#94a3b8",
        fontFamily: "system-ui, sans-serif",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      Plasma Store
    </div>
  );
}

/**
 * BrowserRouter necesita `document`. Montamos solo tras hydrate/cliente
 * con un contenedor estable para evitar errores removeChild del overlay de Next.
 */
export default function RootShell() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <div id="plasma-app-root" suppressHydrationWarning>
      {!ready ? (
        <BootFallback />
      ) : (
        <BrowserRouter basename={basename()}>
          <AuthProvider>
            <PosPopupProvider>
              <App />
              <PosPopupHost />
            </PosPopupProvider>
          </AuthProvider>
        </BrowserRouter>
      )}
    </div>
  );
}

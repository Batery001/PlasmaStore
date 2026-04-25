"use client";

import dynamic from "next/dynamic";

/** React Router 7 `BrowserRouter` usa `document` al montar; no puede renderizarse en el SSR de Next. */
const RootShell = dynamic(() => import("@/RootShell"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#050308",
        color: "#e9d5ff",
        fontFamily: "system-ui, sans-serif",
        fontSize: "0.95rem",
      }}
    >
      Cargando Plasma Store…
    </div>
  ),
});

export default function CatchAllPage() {
  return <RootShell />;
}

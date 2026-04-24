"use client";

import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import App from "./App";

function basename(): string | undefined {
  const b = process.env.NEXT_PUBLIC_BASE_PATH;
  if (b == null || b === "" || b === "/") return undefined;
  return b.endsWith("/") ? b.slice(0, -1) : b;
}

export default function RootShell() {
  return (
    <BrowserRouter basename={basename()}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  );
}

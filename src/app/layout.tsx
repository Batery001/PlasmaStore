import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StrictMode } from "react";
import "../index.css";

export const metadata: Metadata = {
  title: "Plasma Store — cartas Pokémon (CLP)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <StrictMode>{children}</StrictMode>
      </body>
    </html>
  );
}

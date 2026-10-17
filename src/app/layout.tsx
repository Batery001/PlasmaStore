import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DM_Sans } from "next/font/google";
import "../index.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  variable: "--font-dm",
});

export const metadata: Metadata = {
  title: "Plasma Store — cartas Pokémon (CLP)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={dmSans.variable} suppressHydrationWarning>
      <body style={{ fontFamily: "var(--font-dm), system-ui, sans-serif" }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

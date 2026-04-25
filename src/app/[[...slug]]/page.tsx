"use client";

import RootShell from "@/RootShell";

/**
 * Import directo (sin `next/dynamic` + chunk aparte): evita pantalla en blanco y errores tipo
 * `Cannot find module './682.js'` cuando la caché `.next` queda corrupta en Windows.
 * `RootShell` ya es cliente; React Router 7 tolera el pre-render de esta ruta en la práctica.
 */
export default function CatchAllPage() {
  return <RootShell />;
}

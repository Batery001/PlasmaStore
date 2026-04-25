type Props = { className?: string };

/** Logo real de la tienda (recorte via contenedor CSS). */
export function PlasmaOrbLogo({ className }: Props) {
  return (
    <span className={className} aria-hidden>
      <img src="/plasma-store-logo-transparent.png" alt="" width={220} height={220} />
    </span>
  );
}

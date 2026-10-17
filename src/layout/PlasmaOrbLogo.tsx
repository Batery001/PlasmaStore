type Props = { className?: string };

/** Logo real de la tienda (WebP chico; el PNG enorme ya no se usa en header). */
export function PlasmaOrbLogo({ className }: Props) {
  return (
    <span className={className} aria-hidden>
      <img
        src="/plasma-store-logo-76.webp"
        srcSet="/plasma-store-logo-76.webp 1x, /plasma-store-logo-152.webp 2x"
        alt=""
        width={38}
        height={38}
        decoding="async"
      />
    </span>
  );
}

import { useMemo, useState, type CSSProperties } from "react";
import { DECK_SPRITE_TORNEOS_PX } from "./deckSpriteSizes";
import { resolveDeckSpriteSrc, shouldUsePixelatedSpriteRendering } from "./limitlessPokemonSprite";
import styles from "./DeckSpriteImg.module.css";

type Variant = "light" | "dark";

export type DeckSpriteImgProps = {
  /** URL absoluta (PokeAPI, etc.) o slug Limitless (p. ej. `dragapult`). */
  src: string;
  size?: number;
  /** Accesibilidad: nombre del Pokémon o del jugador. */
  alt: string;
  variant?: Variant;
  /** `plain`: sin borde ni fondo; el contenedor no reserva un cuadrado `size` (menos aire vacío). */
  frame?: "card" | "plain";
  /**
   * En `plain`: `contain` respeta el PNG entero; `square-cover` recorta en un cuadrado (menos transparente arriba).
   */
  plainFit?: "contain" | "square-cover";
  /**
   * Solo con `plainFit="square-cover"`: recorta px de la **altura** del contenedor (ancho igual a `maxDim`).
   * Acorta la fila sin bajar `size`/`spriteScale`; suele quitar aire bajo el sprite si ya está subido con `translateY`.
   */
  plainSquareCoverShavePx?: number;
  /**
   * Solo con `square-cover`: ancho del contenedor = `maxDim * escala` (0–1], mín. 36px).
   * Reduce el hueco horizontal entre Pokémon sin bajar `spriteScale` (recorta transparente lateral).
   */
  plainSquareCoverWidthScale?: number;
  /**
   * Escala visual máxima (respecto a `size`) en modo `plain`, o zoom dentro del recuadro en modo `card`.
   */
  spriteScale?: number;
  className?: string;
};

export function DeckSpriteImg({
  src,
  size = DECK_SPRITE_TORNEOS_PX,
  alt,
  variant = "light",
  frame = "card",
  plainFit = "contain",
  plainSquareCoverShavePx = 0,
  plainSquareCoverWidthScale = 1,
  spriteScale,
  className,
}: DeckSpriteImgProps) {
  const resolved = useMemo(() => resolveDeckSpriteSrc(src), [src]);
  const usePixelated = Boolean(resolved) && shouldUsePixelatedSpriteRendering(resolved);
  const [broken, setBroken] = useState(false);

  if (!src.trim()) return null;

  const innerScale =
    spriteScale != null && Number.isFinite(spriteScale) && spriteScale > 0
      ? spriteScale
      : usePixelated
        ? 1.16
        : 1;

  const isPlain = frame === "plain";

  const wrapCls = [
    isPlain ? styles.wrapPlain : styles.wrap,
    frame === "card" && variant === "dark" ? styles.wrapDark : "",
    usePixelated && !isPlain ? styles.wrapPixelBoost : "",
    className || "",
  ]
    .filter(Boolean)
    .join(" ");
  const fbCls = [styles.fallback, variant === "dark" ? styles.fallbackDark : ""].filter(Boolean).join(" ");

  if (!resolved || broken) {
    return (
      <span className={fbCls} style={{ width: size, height: size }} title={alt} aria-label={alt}>
        ?
      </span>
    );
  }

  const maxDim = Math.round(size * Math.min(innerScale, 2));
  const plainSquareCover = isPlain && plainFit === "square-cover";
  const shave =
    plainSquareCover && plainSquareCoverShavePx > 0
      ? Math.min(plainSquareCoverShavePx, Math.max(0, maxDim - 52))
      : 0;
  const coverBoxH = plainSquareCover ? maxDim - shave : maxDim;
  const coverW =
    plainSquareCover &&
    plainSquareCoverWidthScale > 0 &&
    plainSquareCoverWidthScale < 1
      ? Math.max(36, Math.round(maxDim * plainSquareCoverWidthScale))
      : maxDim;

  const wrapStyle: CSSProperties = isPlain
    ? {
        lineHeight: 0,
        background: "transparent",
        border: "none",
        boxShadow: "none",
        outline: "none",
        padding: 0,
        margin: 0,
        ...(plainSquareCover
          ? {
              width: coverW,
              height: coverBoxH,
              overflow: "hidden",
            }
          : {}),
      }
    : { width: size, height: size, lineHeight: 0 };

  const imgStyle: CSSProperties = {};
  if (isPlain) {
    if (plainSquareCover) {
      imgStyle.width = "100%";
      imgStyle.height = "100%";
      imgStyle.maxWidth = "none";
      imgStyle.maxHeight = "none";
      imgStyle.objectFit = "cover";
      /* Ancla más arriba + translate: sube el dibujo en la celda */
      imgStyle.objectPosition = "50% 70%";
      imgStyle.transform = "translateY(-14px)";
      imgStyle.transformOrigin = "center bottom";
    } else {
      imgStyle.maxHeight = maxDim;
      imgStyle.maxWidth = maxDim;
      imgStyle.width = "auto";
      imgStyle.height = "auto";
      imgStyle.objectFit = "contain";
      imgStyle.objectPosition = "50% 100%";
    }
    imgStyle.display = "block";
    imgStyle.background = "transparent";
    imgStyle.border = "none";
    imgStyle.boxShadow = "none";
    imgStyle.outline = "none";
    imgStyle.verticalAlign = "bottom";
  } else if (innerScale !== 1) {
    imgStyle.transform = `scale(${innerScale})`;
  }

  const imgClass = `${styles.img} ${usePixelated ? styles.pixelated : styles.smooth}${isPlain ? ` ${styles.imgPlain}` : ""}${!isPlain && innerScale !== 1 ? ` ${styles.imgScaled}` : ""}`;

  return (
    <span className={wrapCls} style={wrapStyle}>
      <img
        src={resolved}
        alt={alt}
        className={imgClass}
        style={Object.keys(imgStyle).length ? imgStyle : undefined}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
      />
    </span>
  );
}

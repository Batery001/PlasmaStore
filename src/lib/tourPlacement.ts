/** Posición del globo de la mascota al lado del recuadro del tutorial. */

export type SpotRect = { top: number; left: number; width: number; height: number };

export type CardPlacement = {
  top: number;
  left: number;
  width: number;
  side: "right" | "left" | "bottom";
};

export function placeTourCard(spot: SpotRect | null, opts?: { maxWidth?: number; estHeight?: number }): CardPlacement {
  const maxWidth = opts?.maxWidth ?? 420;
  const estHeight = opts?.estHeight ?? 210;
  const gap = 14;
  const width = Math.min(maxWidth, window.innerWidth - 24);
  const vh = window.innerHeight;
  const vw = window.innerWidth;

  if (!spot) {
    return {
      top: Math.max(8, vh - estHeight - 16),
      left: Math.max(8, (vw - width) / 2),
      width,
      side: "bottom",
    };
  }

  const rightSpace = vw - (spot.left + spot.width);
  const leftSpace = spot.left;

  if (rightSpace >= width + gap + 8) {
    return {
      top: clamp(spot.top, 8, vh - estHeight - 8),
      left: spot.left + spot.width + gap,
      width,
      side: "right",
    };
  }

  if (leftSpace >= width + gap + 8) {
    return {
      top: clamp(spot.top, 8, vh - estHeight - 8),
      left: spot.left - width - gap,
      width,
      side: "left",
    };
  }

  const belowTop = spot.top + spot.height + gap;
  if (belowTop + estHeight < vh - 8) {
    return {
      top: belowTop,
      left: clamp(spot.left, 8, vw - width - 8),
      width,
      side: "bottom",
    };
  }

  return {
    top: Math.max(8, spot.top - estHeight - gap),
    left: clamp(spot.left, 8, vw - width - 8),
    width,
    side: "bottom",
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

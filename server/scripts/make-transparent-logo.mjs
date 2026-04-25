import sharp from "sharp";
import { fileURLToPath } from "node:url";

const INPUT = fileURLToPath(new URL("../../public/plasma-store-logo.png", import.meta.url));
const OUTPUT = fileURLToPath(new URL("../../public/plasma-store-logo-transparent.png", import.meta.url));

/**
 * Quita fondo blanco (y casi blanco) convirtiéndolo en alpha.
 * Mantiene el arte del logo intacto tanto como sea posible.
 */
async function main() {
  // Usamos `transparent()` con tolerancia mediante un mask basado en diferencia a blanco.
  // Estrategia:
  // 1) crear máscara = distancia a blanco (invertida) y suavizar
  // 2) aplicar máscara como alpha
  const rgb = await sharp(INPUT).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = rgb;

  const mask = Buffer.alloc(info.width * info.height);
  for (let i = 0, p = 0; i < data.length; i += 3, p += 1) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    // Solo elimina blancos MUY cercanos a puro blanco (fondo),
    // evitando comerse brillos dentro del arte.
    // - Blanco puro / casi puro -> transparente
    if (max >= 253 && min >= 248) {
      mask[p] = 0;
      continue;
    }

    // Candidatos a borde blanco: muy claros y con poca variación de color.
    const nearWhite = max >= 248 && min >= 236 && max - min <= 18;
    if (nearWhite) {
      // Deja una transición suave (anti-aliasing)
      const d = 255 - max; // 0..~20
      const a = Math.min(255, Math.max(0, d * 14)); // más claro => más transparente
      mask[p] = a;
      continue;
    }

    // Resto: opaco
    mask[p] = 255;
  }

  const out = sharp(INPUT)
    .removeAlpha()
    .joinChannel(mask, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true });

  await out.toFile(OUTPUT);
  // eslint-disable-next-line no-console
  console.log("OK:", OUTPUT);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});


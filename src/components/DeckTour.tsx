import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { placeTourCard, type SpotRect } from "../lib/tourPlacement";
import styles from "./deckTour.module.css";

export type DeckTourMode = "paste" | "build";

type TourStep = {
  title: string;
  body: string;
  target: string;
  fallbackTarget?: string;
  mode?: DeckTourMode;
};

const STEPS: TourStep[] = [
  {
    title: "¡Hola! Soy RoboSubstitute",
    body: "Te guío para armar tu primer mazo Pokémon. Puedes pegar una lista de PTCGL o Limitless, o buscar cartas y armarlo aquí.",
    target: "deck-tour-title",
  },
  {
    title: "Nombre del mazo",
    body: "Pon un nombre claro (por ejemplo el arquetipo y el formato). Así lo encuentras rápido al anotarte a un Challenge o Cup.",
    target: "deck-tour-name",
  },
  {
    title: "Dos formas de armar",
    body: "«Pegar lista» si ya tienes el export. «Armar mazo» si quieres buscar cartas y sumarlas una a una.",
    target: "deck-tour-modes",
    mode: "paste",
  },
  {
    title: "Pegar desde PTCGL",
    body: "Copia el export de Pokémon TCG Live o Limitless y pégalo aquí. Idealmente con bloques Pokémon / Entrenadores / Energías.",
    target: "deck-tour-list",
    mode: "paste",
  },
  {
    title: "Revisa el conteo",
    body: "Un mazo legal lleva 60 cartas. Si hay errores (más de 4 copias, etc.), te los marco antes de guardar.",
    target: "deck-tour-list",
    mode: "paste",
  },
  {
    title: "Armar con búsqueda",
    body: "En este modo buscas por nombre, tocas cartas para sumar y quitas copias tocando la fila. Cuando estés listo, usa «Usar esta lista».",
    target: "deck-tour-builder",
    fallbackTarget: "deck-tour-modes",
    mode: "build",
  },
  {
    title: "Guardar",
    body: "Cuando la lista esté lista, guarda el mazo. Queda en Mis mazos y lo puedes elegir al completar el formulario del torneo.",
    target: "deck-tour-save",
    fallbackTarget: "deck-tour-modes",
    mode: "paste",
  },
];

function tourStorageKey(userId: string | number) {
  return `plasma_deck_tour_pokemon_v1_${userId}`;
}

export function shouldStartDeckTour(userId: string | number | null | undefined): boolean {
  if (userId == null) return false;
  try {
    return !localStorage.getItem(tourStorageKey(userId));
  } catch {
    return true;
  }
}

export function markDeckTourDone(userId: string | number) {
  try {
    localStorage.setItem(tourStorageKey(userId), "1");
  } catch {
    /* ignore */
  }
}

/** Para volver a ver el tutorial (p. ej. ?tour=1). */
export function clearDeckTourDone(userId: string | number) {
  try {
    localStorage.removeItem(tourStorageKey(userId));
  } catch {
    /* ignore */
  }
}

function findTourEl(step: TourStep): HTMLElement | null {
  const primary = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
  if (primary) return primary;
  if (step.fallbackTarget) {
    return document.querySelector(`[data-tour="${step.fallbackTarget}"]`) as HTMLElement | null;
  }
  return null;
}

export function DeckTour({
  userId,
  active,
  onMode,
  onFinished,
}: {
  userId: string | number;
  active: boolean;
  onMode?: (mode: DeckTourMode) => void;
  onFinished: () => void;
}) {
  const [step, setStep] = useState(0);
  const [spot, setSpot] = useState<SpotRect | null>(null);
  const [mounted, setMounted] = useState(false);

  const current = STEPS[step] || STEPS[0];
  const isLast = step >= STEPS.length - 1;
  const progress = useMemo(() => `${step + 1} / ${STEPS.length}`, [step]);
  const card = useMemo(() => placeTourCard(spot), [spot]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!active) return;
    if (current.mode) onMode?.(current.mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, current.mode, step]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let tries = 0;

    function measure() {
      if (cancelled) return;
      const el = findTourEl(current);
      if (!el) {
        if (tries < 16) {
          tries += 1;
          window.setTimeout(measure, 70);
        } else {
          setSpot(null);
        }
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) {
        if (tries < 16) {
          tries += 1;
          window.setTimeout(measure, 70);
        }
        return;
      }
      const pad = 8;
      setSpot({
        top: Math.max(4, r.top - pad),
        left: Math.max(4, r.left - pad),
        width: Math.min(window.innerWidth - 8, r.width + pad * 2),
        height: Math.min(window.innerHeight - 8, r.height + pad * 2),
      });
    }

    const el0 = findTourEl(current);
    if (el0) {
      el0.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }

    const t0 = window.setTimeout(measure, 80);
    const t1 = window.setTimeout(measure, 280);
    const t2 = window.setTimeout(measure, 520);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelled = true;
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, current, step]);

  if (!active || !mounted) return null;

  function finish() {
    markDeckTourDone(userId);
    onFinished();
  }

  return createPortal(
    <div className={styles.root} role="dialog" aria-modal="true" aria-label="Tutorial de mazos con RoboSubstitute">
      <div className={styles.clickCatch} onClick={finish} aria-hidden />
      {spot ? (
        <div
          className={styles.spot}
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
          }}
          aria-hidden
        />
      ) : null}

      <div
        className={`${styles.card} ${styles[`side_${card.side}`] || ""}`}
        style={{ top: card.top, left: card.left, width: card.width }}
      >
        <div className={styles.robo}>
          <img src="/robosustitute.png" alt="" width={88} height={110} decoding="async" />
        </div>
        <div className={styles.speech}>
          <p className={styles.kicker}>RoboSubstitute · {progress}</p>
          <h2 className={styles.title}>{current.title}</h2>
          <p className={styles.body}>{current.body}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.skip} onClick={finish}>
              Saltar
            </button>
            {!isLast ? (
              <button type="button" className={styles.next} onClick={() => setStep((s) => s + 1)}>
                Siguiente
              </button>
            ) : (
              <button type="button" className={styles.next} onClick={finish}>
                ¡A armar!
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

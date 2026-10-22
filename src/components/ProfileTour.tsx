import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { placeTourCard, type SpotRect } from "../lib/tourPlacement";
import styles from "./profileTour.module.css";

export type ProfileTourTab = "perfil" | "info" | "compras" | "eventos" | "mazos" | "seguridad" | "privacidad";

type TourStep = {
  tab: ProfileTourTab;
  title: string;
  body: string;
  target: string;
  fallbackTarget?: string;
};

const STEPS: TourStep[] = [
  {
    tab: "perfil",
    title: "¡Hola! Soy Plasmin",
    body: "Te doy la bienvenida a tu cuenta Plasma. Esta es tu pestaña principal: aquí ves los torneos de la tienda y dónde se publican.",
    target: "tour-panel-perfil",
    fallbackTarget: "tour-tab-perfil",
  },
  {
    tab: "info",
    title: "Tu información",
    body: "Completa tu RUT, POPID y CL si juegas Pokémon o Mitos. Así no los tienes que repetir en cada torneo.",
    target: "tour-panel-info",
    fallbackTarget: "tour-profile-info",
  },
  {
    tab: "compras",
    title: "Mis compras",
    body: "Aquí ves el historial de pedidos, estados de pago y envíos. Si algo queda pendiente, lo encuentras en esta pestaña.",
    target: "tour-panel-compras",
    fallbackTarget: "tour-tab-compras",
  },
  {
    tab: "eventos",
    title: "Mis eventos",
    body: "Los cupos de Challenge, Cup o ligas MyL aparecen aquí. Después de pagar, completas POPID/CL y la lista si hace falta.",
    target: "tour-panel-eventos",
    fallbackTarget: "tour-tab-eventos",
  },
  {
    tab: "mazos",
    title: "Mis mazos",
    body: "Guarda mazos de Pokémon y de Mitos y Leyendas por separado. Después los reutilizas al anotarte a un torneo.",
    target: "tour-panel-mazos",
    fallbackTarget: "tour-tab-mazos",
  },
  {
    tab: "seguridad",
    title: "Seguridad",
    body: "Puedes cambiar la contraseña cuando quieras. Si no verificaste el correo, también lo resuelves desde el perfil.",
    target: "tour-panel-seguridad",
    fallbackTarget: "tour-tab-seguridad",
  },
  {
    tab: "privacidad",
    title: "Privacidad",
    body: "Aquí puedes exportar o eliminar tu cuenta. Listo: ya conoces tu perfil. ¡A jugar!",
    target: "tour-panel-privacidad",
    fallbackTarget: "tour-tab-privacidad",
  },
];

function tourStorageKey(userId: string | number) {
  return `plasma_profile_tour_done_v1_${userId}`;
}

export function shouldStartProfileTour(userId: string | number | null | undefined): boolean {
  if (userId == null) return false;
  try {
    if (localStorage.getItem(tourStorageKey(userId))) return false;
    return sessionStorage.getItem("plasma_start_profile_tour") === "1";
  } catch {
    return false;
  }
}

export function markProfileTourPending() {
  try {
    sessionStorage.setItem("plasma_start_profile_tour", "1");
  } catch {
    /* ignore */
  }
}

export function clearProfileTourPending() {
  try {
    sessionStorage.removeItem("plasma_start_profile_tour");
  } catch {
    /* ignore */
  }
}

export function markProfileTourDone(userId: string | number) {
  clearProfileTourPending();
  try {
    localStorage.setItem(tourStorageKey(userId), "1");
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

export function ProfileTour({
  userId,
  active,
  onGoTab,
  onFinished,
}: {
  userId: string | number;
  active: boolean;
  onGoTab: (tab: ProfileTourTab) => void;
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
    onGoTab(current.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, current.tab, step]);

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
          window.setTimeout(measure, 60);
        } else {
          setSpot(null);
        }
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) {
        if (tries < 16) {
          tries += 1;
          window.setTimeout(measure, 60);
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

    const t0 = window.setTimeout(measure, 50);
    const t1 = window.setTimeout(measure, 250);
    const t2 = window.setTimeout(measure, 500);
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
    markProfileTourDone(userId);
    onFinished();
  }

  return createPortal(
    <div className={styles.root} role="dialog" aria-modal="true" aria-label="Recorrido del perfil con Plasmin">
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
        <div className={styles.plasmin}>
          <img src="/mascot-about.png" alt="" width={88} height={110} decoding="async" />
        </div>
        <div className={styles.speech}>
          <p className={styles.kicker}>Plasmin · {progress}</p>
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
                ¡Listo!
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

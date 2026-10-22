import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { parseResponseJson } from "../lib/parseResponseJson";
import styles from "./about.module.css";

type AboutBlock = {
  enabled?: boolean;
  title?: string;
  body?: string;
};

const SPARKS = [
  [12, 18, "0s"],
  [78, 14, "0.4s"],
  [88, 42, "1.1s"],
  [8, 55, "0.7s"],
  [62, 72, "1.6s"],
] as const;

export function AboutPage() {
  const [about, setAbout] = useState<AboutBlock | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/store/site-content")
      .then((r) =>
        parseResponseJson<{ ok?: boolean; content?: { about?: AboutBlock }; error?: string }>(r).then((j) => ({
          ok: r.ok,
          j,
        }))
      )
      .then(({ ok, j }) => {
        if (!alive) return;
        if (!ok || !j?.ok) throw new Error(j?.error || "No se pudo cargar.");
        setAbout(j.content?.about || null);
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : "Error");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (err) {
    return (
      <div className={styles.root}>
        <p className={styles.error}>{err}</p>
      </div>
    );
  }

  if (!about) {
    return (
      <div className={styles.root}>
        <p className={styles.loading}>Cargando…</p>
      </div>
    );
  }

  if (about.enabled === false) {
    return (
      <div className={styles.root}>
        <p className={styles.loading}>
          Esta sección está desactivada. <Link to="/">Volver al inicio</Link>
        </p>
      </div>
    );
  }

  const title = about.title || "Quiénes somos";
  const body = about.body || "Pronto contaremos más sobre nosotros.";

  return (
    <div className={styles.root}>
      <div className={styles.bgGlow} aria-hidden />
      <div className={styles.bgGrid} aria-hidden />
      <div className={styles.sparks} aria-hidden>
        {SPARKS.map(([l, t, d], i) => (
          <span key={i} className={styles.spark} style={{ left: `${l}%`, top: `${t}%`, animationDelay: d }} />
        ))}
      </div>

      <section className={styles.stage}>
        <div className={styles.copyCol}>
          <p className={styles.kicker}>Plasma Store</p>
          <h1 className={styles.title}>{title}</h1>
          <div className={styles.rule} aria-hidden />
          <p className={styles.body}>{body}</p>
          <div className={styles.actions}>
            <Link to="/catalogo" className={styles.btnPrimary}>
              Ver catálogo
            </Link>
            <Link to="/eventos" className={styles.btnGhost}>
              Ver eventos
            </Link>
          </div>
        </div>

        <div className={styles.mascotCol}>
          <div className={styles.mascotAura} aria-hidden />
          <img
            className={styles.mascot}
            src="/mascot-about.png"
            alt="Mascota de Plasma Store"
            width={280}
            height={360}
            decoding="async"
            fetchPriority="high"
          />
        </div>
      </section>
    </div>
  );
}

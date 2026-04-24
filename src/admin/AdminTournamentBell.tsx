import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getStandingsRootUrl } from "../lib/standingsRoot";
import { parseResponseJson } from "../lib/parseResponseJson";
import styles from "./admin.module.css";

const STORAGE_KEY = "plasma-admin-last-tournament-sig";

type PendingPayload = {
  tournamentName?: string;
  tournamentStartDate?: string;
};

type PendingState = {
  fileName: string;
  mtimeMs: number;
  payload: PendingPayload | null;
  parseError: string | null;
  hasFinishedStandings: boolean;
} | null;

function signature(p: PendingState): string {
  if (!p?.fileName) return "";
  return `${p.fileName}:${p.mtimeMs}`;
}

export function AdminTournamentBell() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingState>(null);
  const [pendingOk, setPendingOk] = useState(true);
  const [unread, setUnread] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/pending");
      const data = await parseResponseJson<{
        ok?: boolean;
        pending?: PendingState;
      }>(res);
      const pend = data.pending ?? null;
      setPending(pend);
      setPendingOk(data.ok !== false);
      const sig = signature(pend);
      const last = localStorage.getItem(STORAGE_KEY) || "";
      setUnread(Boolean(sig && sig !== last));
    } catch {
      setPending(null);
      setPendingOk(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 45000);
    return () => window.clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function markSeen() {
    const sig = signature(pending);
    if (sig) localStorage.setItem(STORAGE_KEY, sig);
    setUnread(false);
    setOpen(false);
  }

  const p = pending?.payload;
  const title = p?.tournamentName || pending?.fileName || "Sin archivo .tdf";
  const standingsUrl = getStandingsRootUrl();

  return (
    <div className={styles.bellWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.bellBtn}
        aria-label="Avisos de torneo"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        🔔
        {unread ? <span className={styles.bellBadge} aria-hidden /> : null}
      </button>
      {open && (
        <div className={styles.bellPanel} role="dialog" aria-label="Último torneo">
          <p className={styles.bellPanelTitle}>Último torneo (.tdf)</p>
          {!pending?.fileName ? (
            <p className={styles.muted}>No hay archivo .tdf pendiente en el servidor.</p>
          ) : !pendingOk && pending?.parseError ? (
            <p className={styles.error}>{pending.parseError}</p>
          ) : (
            <>
              <p className={styles.bellPanelRow}>
                <strong>Archivo:</strong> {pending.fileName}
              </p>
              <p className={styles.bellPanelRow}>
                <strong>Nombre:</strong> {title}
              </p>
              {p?.tournamentStartDate ? (
                <p className={styles.bellPanelRow}>
                  <strong>Fecha:</strong> {p.tournamentStartDate}
                </p>
              ) : null}
              <p className={styles.bellPanelRow}>
                <strong>Standings listos en archivo:</strong>{" "}
                {pending.hasFinishedStandings ? "Sí" : "No"}
              </p>
            </>
          )}
          <div className={styles.bellPanelActions}>
            <a className={styles.btnPrimary} href={standingsUrl} target="_blank" rel="noreferrer">
              Abrir standings
            </a>
            <Link to="/torneos" className={styles.btn} onClick={() => setOpen(false)}>
              Ver en tienda
            </Link>
            <Link to="/admin/torneos-sprites" className={styles.btn} onClick={() => setOpen(false)}>
              Sprites / listas
            </Link>
            <button type="button" className={styles.btn} onClick={markSeen} disabled={!signature(pending)}>
              Marcar como visto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import styles from "./whatsappFloat.module.css";

type Site = { socials?: Array<{ key: string; url: string }> };

export function WhatsAppFloat() {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/store/site-content")
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j?.ok) return;
        const socials = (j.content?.socials || []) as NonNullable<Site["socials"]>;
        const wa = socials.find((s) => String(s.key).toLowerCase() === "whatsapp");
        const url = String(wa?.url || "").trim();
        if (url) setHref(url);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!href) return null;

  return (
    <a
      className={styles.fab}
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Consultas por WhatsApp"
      title="Consultas (no vendemos cupos por chat)"
    >
      WhatsApp
    </a>
  );
}

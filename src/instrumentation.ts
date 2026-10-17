/**
 * Al arrancar Next: DNS públicos + precalentar SQLite/API (mitiga 1ª carga lenta).
 */
import dns from "node:dns";

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env["MONGODB_NODE_PUBLIC_DNS"] === "0") return;
  try {
    const custom = process.env["MONGODB_DNS_SERVERS"]?.trim();
    if (custom) {
      dns.setServers(custom.split(/[\s,]+/).filter(Boolean));
    } else {
      dns.setServers(["8.8.8.8", "8.8.4.4"]);
    }
  } catch {
    /* ignore */
  }
  try {
    if (process.platform === "win32" && process.env["MONGODB_IPV4_FIRST"] !== "0") {
      dns.setDefaultResultOrder("ipv4first");
    }
  } catch {
    /* ignore */
  }

  // Precalienta sql.js / índices en background (no bloquea el boot de Next).
  try {
    const { ensureServerReady } = await import("../../server/src/app.mjs");
    void ensureServerReady().catch((e: unknown) => {
      console.warn("[boot] DB warmup:", e instanceof Error ? e.message : e);
    });
  } catch (e) {
    console.warn("[boot] warmup skip:", e instanceof Error ? e.message : e);
  }
}

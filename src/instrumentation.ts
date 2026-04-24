/**
 * Al arrancar Next: DNS públicos antes de cualquier ruta (mitiga SRV con algunos ISP).
 */
import dns from "node:dns";

export function register() {
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
}

import pkg from "../../package.json";

/** Versión de la app (package.json). */
export const APP_VERSION = String(pkg.version || "1.0.0");
export const APP_VERSION_LABEL = `v${APP_VERSION}`;

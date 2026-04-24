export function requiredEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Falta variable de entorno: ${name}`);
  return String(v).trim();
}

export const MONGODB_URI = () => requiredEnv("MONGODB_URI");
export const MONGODB_DB = () => (process.env.MONGODB_DB ? String(process.env.MONGODB_DB).trim() : "plasmastore");
export const APP_SESSION_SECRET = () => requiredEnv("APP_SESSION_SECRET");
export const BOOTSTRAP_TOKEN = () => requiredEnv("BOOTSTRAP_TOKEN");
export const ADMIN_EMAIL = () => requiredEnv("ADMIN_EMAIL").toLowerCase();
export const ADMIN_PASSWORD = () => requiredEnv("ADMIN_PASSWORD");
export const PORT = () => Number(process.env.PORT) || 3847;
export const FRONTEND_ORIGIN = () => (process.env.FRONTEND_ORIGIN ? String(process.env.FRONTEND_ORIGIN).trim() : "");

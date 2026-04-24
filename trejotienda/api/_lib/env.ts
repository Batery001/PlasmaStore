export function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Falta variable de entorno: ${name}`);
  return String(v).trim();
}

export const SUPABASE_URL = () => requiredEnv("SUPABASE_URL");
export const SUPABASE_SERVICE_ROLE_KEY = () => requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
export const APP_SESSION_SECRET = () => requiredEnv("APP_SESSION_SECRET");

export const BOOTSTRAP_TOKEN = () => requiredEnv("BOOTSTRAP_TOKEN");
export const ADMIN_EMAIL = () => requiredEnv("ADMIN_EMAIL");
export const ADMIN_PASSWORD = () => requiredEnv("ADMIN_PASSWORD");

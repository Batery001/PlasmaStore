import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { parseResponseJson } from "../lib/parseResponseJson";

export type StoreUser = {
  id: number;
  email: string;
  name: string;
  role: "customer" | "admin";
};

type AuthState = {
  user: StoreUser | null | undefined;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoreUser | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/store/me", { credentials: "include" });
      const data = await parseResponseJson<{ user?: StoreUser | null }>(res);
      setUser(data.user ?? null);
    } catch (e) {
      console.warn("[Plasma Store]", e instanceof Error ? e.message : e);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/store/logout", { method: "POST", credentials: "include" });
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading: user === undefined,
      refresh,
      logout,
    }),
    [user, refresh, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fuera de AuthProvider");
  return ctx;
}

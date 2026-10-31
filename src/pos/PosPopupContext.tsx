import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { openPosWindow } from "./openPosWindow";

type PosPopupApi = {
  /** Siempre false: el POS ya no es overlay; se mantiene por compatibilidad. */
  open: boolean;
  minimized: boolean;
  everOpened: boolean;
  show: () => void;
  hide: () => void;
  minimize: () => void;
};

const PosPopupContext = createContext<PosPopupApi | null>(null);

export function PosPopupProvider({ children }: { children: ReactNode }) {
  const show = useCallback(() => {
    openPosWindow();
  }, []);

  const hide = useCallback(() => {}, []);
  const minimize = useCallback(() => {}, []);

  const value = useMemo(
    () => ({ open: false, minimized: false, everOpened: false, show, hide, minimize }),
    [show, hide, minimize]
  );

  return <PosPopupContext.Provider value={value}>{children}</PosPopupContext.Provider>;
}

export function usePosPopup() {
  const ctx = useContext(PosPopupContext);
  if (!ctx) throw new Error("usePosPopup requiere PosPopupProvider");
  return ctx;
}

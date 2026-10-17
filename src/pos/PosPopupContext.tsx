import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type PosPopupApi = {
  open: boolean;
  minimized: boolean;
  everOpened: boolean;
  show: () => void;
  hide: () => void;
  minimize: () => void;
};

const PosPopupContext = createContext<PosPopupApi | null>(null);

export function PosPopupProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [everOpened, setEverOpened] = useState(false);

  const show = useCallback(() => {
    setEverOpened(true);
    setMinimized(false);
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    setOpen(false);
    setMinimized(false);
  }, []);

  const minimize = useCallback(() => {
    setOpen(false);
    setMinimized(true);
  }, []);

  const value = useMemo(
    () => ({ open, minimized, everOpened, show, hide, minimize }),
    [open, minimized, everOpened, show, hide, minimize]
  );

  return <PosPopupContext.Provider value={value}>{children}</PosPopupContext.Provider>;
}

export function usePosPopup() {
  const ctx = useContext(PosPopupContext);
  if (!ctx) throw new Error("usePosPopup requiere PosPopupProvider");
  return ctx;
}

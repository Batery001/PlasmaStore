const POS_WINDOW_NAME = "plasma-pos";

/** Abre (o enfoca) el POS en una ventana del navegador aparte. */
export function openPosWindow() {
  if (typeof window === "undefined") return;
  const url = `${window.location.origin}/admin/pos`;
  // Sin noopener: el nombre reutiliza la misma ventana y se puede enfocar.
  const w = window.open(url, POS_WINDOW_NAME, "width=1280,height=860");
  if (w) {
    try {
      w.focus();
    } catch {
      /* ignore */
    }
  } else {
    window.location.assign(url);
  }
}

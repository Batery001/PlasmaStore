export type EventPlayer = {
  game_tag?: string;
  popid?: string;
  cl?: string;
  full_name?: string;
  birth_year?: number;
  decklist_text?: string;
  decklist_url?: string;
  guardian_name?: string;
  guardian_rut?: string;
  myl_race?: string;
  myl_race_label?: string;
};

export function formatEventPlayerSummary(player: EventPlayer | null | undefined) {
  if (!player) return "";
  if (player.popid || player.game_tag === "pokemon") {
    return `${player.full_name || "Jugador"} · POPID ${player.popid || "—"}${
      player.birth_year ? ` · ${player.birth_year}` : ""
    }`;
  }
  if (player.cl || player.game_tag === "mitos-y-leyendas") {
    return `${player.full_name || "Jugador"} · CL ${player.cl || "—"}${
      player.myl_race_label || player.myl_race ? ` · ${player.myl_race_label || player.myl_race}` : ""
    }`;
  }
  return String(player.full_name || "").trim();
}

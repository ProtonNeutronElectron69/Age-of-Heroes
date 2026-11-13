/** The light brown of a base's top. Only its bevelled edge takes a colour. */
export const BASE_COLOR = "#b89268";

/** The medium grey of every model in the grey scheme, like unpainted miniatures. */
export const MODEL_GREY = "#8b8e94";

/**
 * How figures are coloured, so players can tell whose a figure is and what
 * it is. The model takes one colour and the ring round the edge of its base
 * another.
 * - `faction`: the model is in its faction's colour and the ring in its player's.
 * - `player`: the model is in its player's colour and the ring in its faction's.
 * - `grey`: every model is the same medium grey and the ring is in its player's colour.
 */
export type ColorScheme = "faction" | "player" | "grey";

export const COLOR_SCHEMES: readonly { readonly id: ColorScheme; readonly name: string }[] = [
  { id: "faction", name: "Faction models, player rings" },
  { id: "player", name: "Player models, faction rings" },
  { id: "grey", name: "Grey models, player rings" },
];

export function figureColors(scheme: ColorScheme, faction: string, player: string): { model: string; ring: string } {
  if (scheme === "grey") return { model: MODEL_GREY, ring: player };
  return scheme === "faction" ? { model: faction, ring: player } : { model: player, ring: faction };
}

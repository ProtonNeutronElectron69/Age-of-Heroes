/** The light brown of a base's top. Only its bevelled edge takes a colour. */
export const BASE_COLOR = "#b89268";

/**
 * How figures are coloured, so players can tell both whose a figure is and
 * what it is. One of the two colours goes on the model and the other on the
 * ring round the edge of its base.
 * - `faction`: the model is in its faction's colour and the ring in its player's.
 * - `player`: the model is in its player's colour and the ring in its faction's.
 */
export type ColorScheme = "faction" | "player";

export const COLOR_SCHEMES: readonly { readonly id: ColorScheme; readonly name: string }[] = [
  { id: "faction", name: "Faction models, player rings" },
  { id: "player", name: "Player models, faction rings" },
];

export function figureColors(scheme: ColorScheme, faction: string, player: string): { model: string; ring: string } {
  return scheme === "faction" ? { model: faction, ring: player } : { model: player, ring: faction };
}

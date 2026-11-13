/**
 * How figures are coloured, so players can tell both whose a figure is and
 * what it is. One of the two colours goes on the model and the other on its base.
 * - `faction`: the model is in its faction's colour and the base in its player's.
 * - `player`: the model is in its player's colour and the base in its faction's.
 */
export type ColorScheme = "faction" | "player";

export const COLOR_SCHEMES: readonly { readonly id: ColorScheme; readonly name: string }[] = [
  { id: "faction", name: "Faction models, player bases" },
  { id: "player", name: "Player models, faction bases" },
];

export function figureColors(scheme: ColorScheme, faction: string, player: string): { model: string; base: string } {
  return scheme === "faction" ? { model: faction, base: player } : { model: player, base: faction };
}

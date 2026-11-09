import type { Rng } from "./rng";

export type DieFace = "skull" | "shield" | "blank";

export interface DieDefinition {
  readonly id: string;
  readonly faces: readonly DieFace[];
}

/** Attack die: 3 skulls, 3 blanks. */
export const ATTACK_DIE: DieDefinition = {
  id: "attack",
  faces: ["skull", "skull", "skull", "blank", "blank", "blank"],
};

/** Defense die: 3 shields, 3 blanks. */
export const DEFENSE_DIE: DieDefinition = {
  id: "defense",
  faces: ["shield", "shield", "shield", "blank", "blank", "blank"],
};

export function rollDice(rng: Rng, die: DieDefinition, count: number): DieFace[] {
  const results: DieFace[] = [];
  for (let i = 0; i < Math.max(0, count); i++) {
    results.push(die.faces[rng.int(0, die.faces.length - 1)]!);
  }
  return results;
}

export function countFaces(faces: readonly DieFace[], face: DieFace): number {
  return faces.reduce((n, f) => (f === face ? n + 1 : n), 0);
}

export interface CombatRoll {
  readonly attack: DieFace[];
  readonly defense: DieFace[];
  readonly hits: number;
  readonly blocks: number;
  readonly wounds: number;
}

/**
 * Roll a full attack: the attacker counts skulls, the defender counts
 * shields, and any excess skulls become wounds.
 */
export function rollCombat(
  rng: Rng,
  attackDice: number,
  defenseDice: number,
  dice: { attack: DieDefinition; defense: DieDefinition } = {
    attack: ATTACK_DIE,
    defense: DEFENSE_DIE,
  },
): CombatRoll {
  const attack = rollDice(rng, dice.attack, attackDice);
  const defense = rollDice(rng, dice.defense, defenseDice);
  const hits = countFaces(attack, "skull");
  const blocks = countFaces(defense, "shield");
  return { attack, defense, hits, blocks, wounds: Math.max(0, hits - blocks) };
}

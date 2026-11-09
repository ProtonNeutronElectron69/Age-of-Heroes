/** A command broke the rules. The message is shown to the player. */
export class RulesError extends Error {}

export function fail(message: string): never {
  throw new RulesError(message);
}

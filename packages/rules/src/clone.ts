type CloneFn = <T>(value: T) => T;

// structuredClone exists in every runtime we target (modern browsers, Node 17+)
// but is not in the ES lib typings, so reach it through globalThis.
const native = (globalThis as { structuredClone?: CloneFn }).structuredClone;

/** Deep copy of plain game data. */
export function deepClone<T>(value: T): T {
  return native ? native(value) : (JSON.parse(JSON.stringify(value)) as T);
}

# Age of Heroes: notes for contributors and agents

- Read `docs/RULES.md` (rules) and `docs/PLAN.md` (phases and progress) before changing behaviour. Keep both up to date in the same change.
- `packages/rules` must stay pure and deterministic: no DOM, no Node APIs, no `Math.random`. All randomness goes through the seeded `Rng` stored in `GameState.rng`.
- The engine is a reducer: `applyCommand(state, command, ctx)` never mutates its input and returns events. New player actions are new `Command` variants; validate them and fail with `RulesError`.
- Anything secret must be removed in `viewFor`.
- Rule numbers that may need tuning belong in data (`packages/content`), not in engine code.
- Unit content must be original: no names, characters, card text or stat lines copied from existing games.
- Before pushing, run `pnpm typecheck && pnpm test && pnpm build`.

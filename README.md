# Age of Heroes

An expandable, turn-based 3D tactics game for 2 to 6 players. Heroes and squads from every era and genre fight on battlefields built from stacked hex pieces.

- **Rules:** [docs/RULES.md](docs/RULES.md)
- **Plan and progress:** [docs/PLAN.md](docs/PLAN.md)

## Running locally

Requires Node 22+ and pnpm 10.

```bash
pnpm install
pnpm dev        # start the game at http://localhost:5173
pnpm test       # run the rules and content tests
pnpm typecheck  # type-check every package
pnpm build      # production build in apps/client/dist
```

## Project layout

| Path | What it is |
|---|---|
| `packages/rules` | The rules engine: hex math, map model, dice, turn engine. Pure TypeScript with no graphics, so it can also run on a server. |
| `packages/content` | Game data: terrain types, maps and unit cards, validated on load. |
| `apps/client` | The browser game, built with React and Three.js. |
| `docs` | Rules and implementation plan. |

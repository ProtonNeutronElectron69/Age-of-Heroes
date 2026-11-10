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
pnpm e2e        # browser tests: Basic and Advanced games, then the map editor (run pnpm build first)
BALANCE_REPORT=1 pnpm test balance   # print unit point costs against the balance model
```

## Project layout

| Path | What it is |
|---|---|
| `packages/rules` | The rules engine: hex math, map model, dice, turn engine. Pure TypeScript with no graphics, so it can also run on a server. |
| `packages/content` | Game data: terrain, scenery, the premade maps and the starter units, validated on load. |
| `apps/client` | The browser game and map editor, built with React and Three.js. |
| `docs` | Rules and implementation plan. |

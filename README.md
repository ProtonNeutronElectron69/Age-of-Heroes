# Age of Heroes

An expandable, turn-based 3D tactics game for 2 to 6 players. Heroes and squads from every era and genre fight on battlefields built from stacked hex pieces.

- **Rules:** [docs/RULES.md](docs/RULES.md)
- **Plan and progress:** [docs/PLAN.md](docs/PLAN.md)
- **Online play and hosting the game server:** [docs/HOSTING.md](docs/HOSTING.md)

## Running locally

Requires Node 22+ and pnpm 10.

```bash
pnpm install
pnpm dev        # start the game at http://localhost:5173
pnpm test       # run the rules and content tests
pnpm typecheck  # type-check every package
pnpm server     # build and run the online game server on ws://localhost:8080/ws
pnpm build      # production builds: the game in apps/client/dist, the server in apps/server/dist
pnpm e2e        # browser tests: Basic and Advanced games, the map editor, and an online game (run pnpm build first)
BALANCE_REPORT=1 pnpm test balance   # print unit point costs against the balance model
```

## Project layout

| Path | What it is |
|---|---|
| `packages/rules` | The rules engine: hex math, map model, dice, turn engine. Pure TypeScript with no graphics, so it can also run on a server. |
| `packages/content` | Game data: terrain, scenery, the premade maps and the starter units, validated on load. |
| `packages/protocol` | The online message format, checked with schemas, and the replay file format. |
| `apps/client` | The browser game, map editor, online lobby and replay viewer, built with React and Three.js. |
| `apps/server` | The online game server: rooms, room codes, reconnecting and spectators. It runs the rules engine and sends each player only their own view. |
| `docs` | Rules, implementation plan and hosting guide. |

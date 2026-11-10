# Hosting the online game server

The game itself is a static site on GitHub Pages. Online play also needs the game server in `apps/server`: a small Node program that holds the rooms, runs the rules engine and sends each player only what they may see. It runs as **one instance**. By default it keeps rooms in memory, so restarting it ends the games in progress; give it a data folder (below) to keep them.

## Recommendation: Render

[Render](https://render.com) is the simplest fit:

- It builds the server straight from this repository with the included `render.yaml` and `apps/server/Dockerfile`, and redeploys on every merge to `main`.
- It gives the server an HTTPS address with WebSockets (`wss://`), which a page served from GitHub Pages needs.
- The **free** plan is enough to play with friends. A free service sleeps after about 15 minutes with no requests or WebSocket messages; the first visitor after that waits about a minute while it wakes (the game waits with them). An ongoing game keeps it awake, but a game left alone for more than about 15 minutes is lost when the service sleeps, because free instances have no disk to keep rooms on.
- For a server that never sleeps, and can keep games through restarts and overnight, switch the service to a paid instance in the Render dashboard and add a disk (see [Keeping games through restarts](#keeping-games-through-restarts)); nothing in the repository changes.

Alternatives that work the same way with the Dockerfile: Fly.io and Railway (both paid, always on). Avoid hosts that run several copies of a service at once or cut connections after a short time, since rooms live in one process's memory.

## Set it up (about 10 minutes)

1. **Create the service.** Sign in to Render with GitHub, choose **New > Blueprint**, pick this repository and confirm. Render reads `render.yaml` and creates the `age-of-heroes-server` web service.
2. **Allow the game's address.** When asked for `ALLOWED_ORIGINS`, enter the address the game is served from, without a path: `https://protonneutronelectron69.github.io`. Several addresses can be given, separated by commas. Leaving it empty lets any website connect, which is fine for testing.
3. **Check it runs.** Once deployed, open `https://<service-name>.onrender.com/health`. It should show `{"ok":true,...}`.
4. **Point the game at it.** In GitHub, open the repository's **Settings > Secrets and variables > Actions > Variables** and add a repository variable `GAME_SERVER_URL` with the value `wss://<service-name>.onrender.com/ws`. Then re-run the **Deploy to GitHub Pages** workflow (or merge anything to `main`). The published game now fills in that server under **Online**.

Players can always type another server address in the **Online** panel, so the game also works with a server you run yourself.

## Running the server yourself

```bash
pnpm install
pnpm server                      # builds and starts it on port 8080
```

or with Docker, from the repository root:

```bash
docker build -f apps/server/Dockerfile -t age-of-heroes-server .
```

```bash
docker run -p 8080:8080 -v aoh-data:/data -e DATA_DIR=/data -e ALLOWED_ORIGINS=https://protonneutronelectron69.github.io age-of-heroes-server
```

Settings, all optional:

| Variable | Meaning |
|---|---|
| `PORT` | Port to listen on (default 8080; Render sets its own) |
| `ALLOWED_ORIGINS` | Comma-separated web addresses allowed to connect; empty allows any |
| `DATA_DIR` | Folder to keep rooms in, so games survive a restart (see below). Unset: rooms live in memory only |
| `ROOM_IDLE_HOURS` | How long a room waits with nobody connected before it is closed: 2 hours by default, 72 with `DATA_DIR` |

The server answers `GET /health` and takes WebSocket connections at `/ws`. A page served over `https://` can only reach a `wss://` server, so a server on your own machine works with the local dev build (`pnpm dev`, which uses `ws://localhost:8080/ws`) but not with the published site unless it is behind HTTPS.

## Keeping games through restarts

With `DATA_DIR` set, the server writes each room to a file in that folder (the settings, the seats with their rejoin tokens, and the game's commands) and reads them back when it starts. After a restart or a redeploy, players' browsers reconnect on their own and everyone is back in the same game, in the same seat. A group can also stop for the night and pick the game up the next day, as long as they come back within `ROOM_IDLE_HOURS`.

The folder has to survive restarts, so it must be on a persistent disk:

- **Render:** disks need a paid instance. In the service's settings, switch to a paid instance type, add a disk with mount path `/data`, and add the environment variable `DATA_DIR=/data`. Free instances have no disk, so on the free plan leave `DATA_DIR` unset.
- **Fly.io:** create a volume, mount it at `/data`, and set `DATA_DIR=/data`.
- **Your own machine or Docker:** `docker run -v aoh-data:/data -e DATA_DIR=/data ...`, or any folder with `pnpm server`.

The server's first log line says where it keeps rooms and how many it restored. If it cannot write to the folder, it stops at startup and says so. Rooms are rebuilt by replaying their commands, so a game saved by an older version can fail to load after the rules change; such a room is dropped and noted in the log.

## Limits built in

- Up to 500 rooms. A room is cleared once nobody has been connected to it for `ROOM_IDLE_HOURS` (2 hours, or 72 with a data folder), so players can drop out and come back within that time.
- Up to 40 messages a second per connection, and 1 MB per message (enough for the largest custom map).
- Each person gets a secret token for their seat, stored in their browser, so a reload or dropped connection puts them back in the same seat.

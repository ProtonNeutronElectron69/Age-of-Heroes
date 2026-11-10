# Hosting the online game server

The game itself is a static site on GitHub Pages. Online play also needs the game server in `apps/server`: a small Node program that holds the rooms, runs the rules engine and sends each player only what they may see. It keeps rooms in memory, so it runs as **one instance**; restarting it ends the games in progress.

## Recommendation: Render

[Render](https://render.com) is the simplest fit:

- It builds the server straight from this repository with the included `render.yaml` and `apps/server/Dockerfile`, and redeploys on every merge to `main`.
- It gives the server an HTTPS address with WebSockets (`wss://`), which a page served from GitHub Pages needs.
- The **free** plan is enough to play with friends. A free service sleeps after about 15 minutes with no requests or WebSocket messages; the first visitor after that waits about a minute while it wakes. An ongoing game keeps it awake.
- For a server that never sleeps, switch the service to a paid instance in the Render dashboard; nothing in the repository changes.

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
docker run -p 8080:8080 -e ALLOWED_ORIGINS=https://protonneutronelectron69.github.io age-of-heroes-server
```

Settings, all optional:

| Variable | Meaning |
|---|---|
| `PORT` | Port to listen on (default 8080; Render sets its own) |
| `ALLOWED_ORIGINS` | Comma-separated web addresses allowed to connect; empty allows any |

The server answers `GET /health` and takes WebSocket connections at `/ws`. A page served over `https://` can only reach a `wss://` server, so a server on your own machine works with the local dev build (`pnpm dev`, which uses `ws://localhost:8080/ws`) but not with the published site unless it is behind HTTPS.

## Limits built in

- Up to 500 rooms. A room is cleared once nobody has been connected to it for 2 hours, so players can drop out and come back within that time.
- Up to 40 messages a second per connection, and 1 MB per message (enough for the largest custom map).
- Each person gets a secret token for their seat, stored in their browser, so a reload or dropped connection puts them back in the same seat.

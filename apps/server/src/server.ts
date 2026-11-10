import { createServer, type Server } from "node:http";
import type { ServerMessage } from "@aoh/protocol";
import { WebSocketServer, type WebSocket } from "ws";
import { RoomManager, type Connection } from "./rooms";
import { FileRoomStore } from "./store";

export interface GameServerOptions {
  /** Port to listen on (0 picks a free one). */
  readonly port: number;
  readonly host?: string;
  /** Browser origins allowed to connect; empty allows any. */
  readonly allowedOrigins?: readonly string[];
  /** Folder to keep rooms in, so games survive a restart. Without it, rooms live only in memory. */
  readonly dataDir?: string;
  /** Rooms with nobody connected are removed after this long. */
  readonly idleMs?: number;
}

export interface GameServer {
  readonly port: number;
  readonly rooms: RoomManager;
  close(): Promise<void>;
}

/** Most bytes in one message (a large custom map fits comfortably). */
const MAX_MESSAGE_BYTES = 1024 * 1024;
/** Messages allowed per connection per second before it is cut off. */
const MAX_MESSAGES_PER_SECOND = 40;

/**
 * HTTP server with a health check at /health and the game WebSocket at /ws.
 */
export function startGameServer(options: GameServerOptions): Promise<GameServer> {
  const rooms = new RoomManager({
    ...(options.dataDir ? { store: new FileRoomStore(options.dataDir) } : {}),
    ...(options.idleMs !== undefined ? { idleMs: options.idleMs } : {}),
  });
  const http: Server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, rooms: rooms.roomCount }));
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Age of Heroes game server. Connect a WebSocket to /ws.");
  });

  const allowed = new Set(options.allowedOrigins ?? []);
  const wss = new WebSocketServer({
    server: http,
    path: "/ws",
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient: (info: { origin: string }) => allowed.size === 0 || allowed.has((info.origin ?? "").toLowerCase()),
  });

  wss.on("connection", (socket: WebSocket) => {
    const conn: Connection = {
      send: (message: ServerMessage) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
      },
      close: () => socket.close(4000, "Replaced by a newer connection"),
    };
    let windowStart = Date.now();
    let count = 0;
    socket.on("message", (data: Buffer, isBinary: boolean) => {
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > MAX_MESSAGES_PER_SECOND) {
        socket.close(4008, "Too many messages");
        return;
      }
      if (isBinary) return;
      rooms.handle(conn, data.toString("utf8"));
    });
    socket.on("close", () => rooms.disconnect(conn));
  });

  const sweeper = setInterval(() => rooms.sweep(), 60 * 1000);
  sweeper.unref();

  return new Promise((resolve) => {
    http.listen(options.port, options.host ?? "0.0.0.0", () => {
      const address = http.address();
      const port = typeof address === "object" && address ? address.port : options.port;
      resolve({
        port,
        rooms,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(sweeper);
            for (const client of wss.clients) client.terminate();
            wss.close();
            http.close(() => {
              rooms.flush();
              done();
            });
          }),
      });
    });
  });
}

import { startGameServer } from "./server";

const port = Number(process.env.PORT ?? 8080);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, "").toLowerCase())
  .filter(Boolean);

const dataDir = process.env.DATA_DIR?.trim() || undefined;
// With a data folder, games can wait for their players much longer.
const idleHours = Number(process.env.ROOM_IDLE_HOURS ?? (dataDir ? 72 : 2));
if (!Number.isFinite(idleHours) || idleHours <= 0) throw new Error("ROOM_IDLE_HOURS must be a positive number");

const server = await startGameServer({ port, allowedOrigins, dataDir, idleMs: idleHours * 60 * 60 * 1000 });
console.log(
  `Age of Heroes server listening on port ${server.port}` +
    (allowedOrigins.length ? ` for ${allowedOrigins.join(", ")}` : " (any origin)") +
    (dataDir ? `, keeping rooms in ${dataDir} (${server.rooms.roomCount} restored)` : ", rooms in memory only") +
    `; idle rooms close after ${idleHours} hours`,
);

const stop = () => {
  void server.close().then(() => process.exit(0));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

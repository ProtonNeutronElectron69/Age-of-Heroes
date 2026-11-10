import { startGameServer } from "./server";

const port = Number(process.env.PORT ?? 8080);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, "").toLowerCase())
  .filter(Boolean);

const server = await startGameServer({ port, allowedOrigins });
console.log(
  `Age of Heroes server listening on port ${server.port}` +
    (allowedOrigins.length ? ` for ${allowedOrigins.join(", ")}` : " (any origin)"),
);

const stop = () => {
  void server.close().then(() => process.exit(0));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

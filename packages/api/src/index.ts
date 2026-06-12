import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { mkdirSync } from "fs";
import { authRoutes } from "./routes/auth.js";
import { guildRoutes } from "./routes/guilds.js";
import { registerWsRoutes } from "./ws/relay-events.js";

mkdirSync("./data", { recursive: true });

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  credentials: true,
});

await app.register(cookie);
await app.register(session, {
  secret: process.env.API_SECRET ?? "dev-secret-change-in-production",
  cookie: { secure: false, httpOnly: true, sameSite: "lax" },
  saveUninitialized: false,
});
await app.register(websocket);

await app.register(authRoutes);
await app.register(guildRoutes);
registerWsRoutes(app);

app.get("/health", async () => ({ ok: true }));

const PORT = Number(process.env.API_PORT ?? 3001);
await app.listen({ port: PORT, host: "0.0.0.0" });
console.log(`API listening on port ${PORT}`);

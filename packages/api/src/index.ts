import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { mkdirSync } from "fs";
import { authRoutes } from "./routes/auth.js";
import { configRoutes } from "./routes/config.js";
import { guildRoutes } from "./routes/guilds.js";
import { registerWsRoutes } from "./ws/relay-events.js";
import { discordClient, commands } from "./bot/client.js";
import { loadCommands } from "./bot/commands/loader.js";
import { registerEvents } from "./bot/events/index.js";
import { speakerPool, listenerPool } from "./pool/speakerPool.js";
import { relayManager } from "./relay/manager.js";

mkdirSync("./data", { recursive: true });

// --- Discord bot (control) ---
await loadCommands(commands);
registerEvents(discordClient, commands);
await discordClient.login(process.env.DISCORD_TOKEN);

// --- Listener bot pool ---
const listenerTokens = (process.env.LISTENER_BOT_TOKENS ?? "")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

if (listenerTokens.length === 0) {
  console.warn("[listener-pool] LISTENER_BOT_TOKENS not set — /relay start will fail");
} else {
  await listenerPool.init(listenerTokens);
  console.log(`[listener-pool] ${listenerPool.size} bots ready`);
}

// --- Speaker bot pool ---
const speakerTokens = (process.env.SPEAKER_BOT_TOKENS ?? "")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

if (speakerTokens.length === 0) {
  console.warn("[speaker-pool] SPEAKER_BOT_TOKENS not set — /relay add will fail");
} else {
  await speakerPool.init(speakerTokens);
  console.log(`[speaker-pool] ${speakerPool.size} bots ready`);
}

// --- Restore any sessions that were active before the last restart ---
await relayManager.restore(discordClient);

// --- Fastify API ---
const app = Fastify({ logger: true });

// Allow empty JSON bodies — Fastify 4 rejects Content-Type: application/json with no body
app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body: string, done) => {
  if (!body) return done(null, {});
  try {
    done(null, JSON.parse(body));
  } catch (err) {
    done(err as Error);
  }
});

await app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  credentials: true,
});
await app.register(cookie);
await app.register(session, {
  secret: process.env.API_SECRET ?? "dev-secret-change-in-production!",
  cookie: { secure: false, httpOnly: true, sameSite: "lax" },
  saveUninitialized: false,
});
await app.register(websocket);

await app.register(authRoutes);
await app.register(configRoutes);
await app.register(guildRoutes);
registerWsRoutes(app);

app.get("/health", async () => ({ ok: true }));

const PORT = Number(process.env.API_PORT ?? 3001);
await app.listen({ port: PORT, host: "0.0.0.0" });

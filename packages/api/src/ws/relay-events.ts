import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";

type WSClient = { ws: WebSocket; guildId?: string };

const clients = new Set<WSClient>();

export function registerWsRoutes(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket) => {
    const client: WSClient = { ws: socket };
    clients.add(client);

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; guildId?: string };
        if (msg.type === "subscribe" && msg.guildId) {
          client.guildId = msg.guildId;
        }
      } catch {
        // ignore malformed messages
      }
    });

    socket.on("close", () => clients.delete(client));
  });
}

export function broadcastRelayEvent(guildId: string, event: object) {
  const payload = JSON.stringify({ guildId, ...event });
  for (const client of clients) {
    if (client.guildId === guildId && client.ws.readyState === 1) {
      client.ws.send(payload);
    }
  }
}

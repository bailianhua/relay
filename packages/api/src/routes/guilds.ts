import type { FastifyInstance } from "fastify";
import { db } from "../db/schema.js";

export async function guildRoutes(app: FastifyInstance) {
  app.get("/guilds", async (req, reply) => {
    const guilds = db.prepare("SELECT * FROM guilds ORDER BY name").all();
    reply.send(guilds);
  });

  app.get<{ Params: { guildId: string } }>("/guilds/:guildId/sessions", async (req, reply) => {
    const { guildId } = req.params;

    const sessions = db
      .prepare(`
        SELECT s.*, GROUP_CONCAT(st.channel_id) AS target_channel_ids
        FROM sessions s
        LEFT JOIN session_targets st ON st.session_id = s.id
        WHERE s.guild_id = ?
        GROUP BY s.id
        ORDER BY s.created_at DESC
        LIMIT 50
      `)
      .all(guildId) as Array<{ target_channel_ids: string | null } & Record<string, unknown>>;

    const result = sessions.map((s) => ({
      ...s,
      targetChannelIds: s.target_channel_ids ? s.target_channel_ids.split(",") : [],
    }));

    reply.send(result);
  });

  app.get<{ Params: { guildId: string } }>("/guilds/:guildId/sessions/active", async (req, reply) => {
    const { guildId } = req.params;

    const session = db
      .prepare(`
        SELECT s.*, GROUP_CONCAT(st.channel_id) AS target_channel_ids
        FROM sessions s
        LEFT JOIN session_targets st ON st.session_id = s.id
        WHERE s.guild_id = ? AND s.active = 1
        GROUP BY s.id
        LIMIT 1
      `)
      .get(guildId) as ({ target_channel_ids: string | null } & Record<string, unknown>) | undefined;

    if (!session) return reply.send(null);

    reply.send({
      ...session,
      targetChannelIds: session.target_channel_ids ? session.target_channel_ids.split(",") : [],
    });
  });
}

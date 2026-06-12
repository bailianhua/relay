import type { FastifyInstance, FastifyRequest } from "fastify";
import { ChannelType } from "discord.js";
import type { VoiceChannel } from "discord.js";
import { db } from "../db/schema.js";
import { discordClient } from "../bot/client.js";
import { relayManager } from "../relay/manager.js";

function sessionUserId(req: FastifyRequest): string | undefined {
  return (req.session as unknown as Record<string, unknown>).userId as string | undefined;
}

async function resolveGuild(guildId: string) {
  return discordClient.guilds.cache.get(guildId) ?? discordClient.guilds.fetch(guildId);
}

export async function guildRoutes(app: FastifyInstance) {
  // ── Guilds ──────────────────────────────────────────────────────────────

  app.get("/guilds", async (_req, reply) => {
    reply.send(
      discordClient.guilds.cache.map((g) => ({ id: g.id, name: g.name, icon: g.icon }))
    );
  });

  app.get<{ Params: { guildId: string } }>("/guilds/:guildId", async (req, reply) => {
    const g = discordClient.guilds.cache.get(req.params.guildId);
    if (!g) return reply.status(404).send({ error: "Guild not found" });
    reply.send({ id: g.id, name: g.name, icon: g.icon });
  });

  app.get<{ Params: { guildId: string } }>("/guilds/:guildId/channels", async (req, reply) => {
    const guild = await resolveGuild(req.params.guildId).catch(() => null);
    if (!guild) return reply.status(404).send({ error: "Guild not found" });

    await guild.channels.fetch();
    const channels = [...guild.channels.cache.values()]
      .filter((c): c is VoiceChannel => c.type === ChannelType.GuildVoice)
      .map((c) => ({ id: c.id, name: c.name, position: c.rawPosition }))
      .sort((a, b) => a.position - b.position);

    reply.send(channels);
  });

  app.get<{ Params: { guildId: string } }>("/guilds/:guildId/members", async (req, reply) => {
    const guild = await resolveGuild(req.params.guildId).catch(() => null);
    if (!guild) return reply.status(404).send({ error: "Guild not found" });

    const members = await guild.members.fetch();
    reply.send(
      [...members.values()]
        .filter((m) => !m.user.bot)
        .map((m) => ({
          id: m.id,
          displayName: m.displayName,
          username: m.user.username,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
    );
  });

  // ── Sessions (read) ────────────────────────────────────────────────────

  app.get<{ Params: { guildId: string } }>("/guilds/:guildId/sessions", async (req, reply) => {
    const rows = db
      .prepare(
        `SELECT s.id, s.guild_id, s.active, s.created_at, s.stopped_at,
                GROUP_CONCAT(DISTINCT st.channel_id)                      AS target_channel_ids,
                GROUP_CONCAT(DISTINCT ss.user_id || ':' || ss.channel_id) AS source_entries
         FROM sessions s
         LEFT JOIN session_targets st ON st.session_id = s.id
         LEFT JOIN session_sources ss ON ss.session_id = s.id
         WHERE s.guild_id = ?
         GROUP BY s.id
         ORDER BY s.created_at DESC
         LIMIT 50`
      )
      .all(req.params.guildId) as SessionRow[];

    reply.send(rows.map(parseSessionRow));
  });

  app.get<{ Params: { guildId: string } }>(
    "/guilds/:guildId/sessions/active",
    async (req, reply) => {
      reply.send(relayManager.getActiveSession(req.params.guildId) ?? null);
    }
  );

  // ── Shotcallers ────────────────────────────────────────────────────────

  app.get<{ Params: { guildId: string } }>("/guilds/:guildId/shotcallers", async (req, reply) => {
    reply.send(
      db
        .prepare("SELECT * FROM shotcallers WHERE guild_id = ? ORDER BY display_name")
        .all(req.params.guildId)
    );
  });

  app.post<{
    Params: { guildId: string };
    Body: { userId: string; displayName: string };
  }>("/guilds/:guildId/shotcallers", async (req, reply) => {
    if (!sessionUserId(req)) return reply.status(401).send({ error: "Not authenticated" });
    const { guildId } = req.params;
    const { userId, displayName } = req.body ?? {};
    if (!userId?.trim() || !displayName?.trim()) {
      return reply.status(400).send({ error: "userId and displayName are required" });
    }
    db.prepare(
      "INSERT OR REPLACE INTO shotcallers (user_id, guild_id, display_name) VALUES (?, ?, ?)"
    ).run(userId.trim(), guildId, displayName.trim());
    reply.send(
      db
        .prepare("SELECT * FROM shotcallers WHERE user_id = ? AND guild_id = ?")
        .get(userId.trim(), guildId)
    );
  });

  app.delete<{ Params: { guildId: string; userId: string } }>(
    "/guilds/:guildId/shotcallers/:userId",
    async (req, reply) => {
      if (!sessionUserId(req)) return reply.status(401).send({ error: "Not authenticated" });
      db.prepare("DELETE FROM shotcallers WHERE user_id = ? AND guild_id = ?").run(
        req.params.userId,
        req.params.guildId
      );
      reply.send({ ok: true });
    }
  );

  // ── Session control ────────────────────────────────────────────────────

  app.post<{ Params: { guildId: string } }>("/guilds/:guildId/session", async (req, reply) => {
    if (!sessionUserId(req)) return reply.status(401).send({ error: "Not authenticated" });
    try {
      const session = await relayManager.create({
        controlClient: discordClient,
        guildId: req.params.guildId,
      });
      reply.send(session);
    } catch (err) {
      reply.status(503).send({ error: (err as Error).message });
    }
  });

  app.post<{
    Params: { guildId: string };
    Body: { intervalMinutes: number };
  }>("/guilds/:guildId/session/jingle", async (req, reply) => {
    if (!sessionUserId(req)) return reply.status(401).send({ error: "Not authenticated" });
    const intervalMinutes = Number(req.body?.intervalMinutes);
    if (!intervalMinutes || intervalMinutes < 1) {
      return reply.status(400).send({ error: "intervalMinutes must be >= 1" });
    }
    try {
      const ok = relayManager.startJingle(req.params.guildId, intervalMinutes);
      if (!ok) return reply.status(404).send({ error: "No active relay session" });
      reply.send({ ok: true });
    } catch (err) {
      reply.status(503).send({ error: (err as Error).message });
    }
  });

  app.delete<{ Params: { guildId: string } }>(
    "/guilds/:guildId/session/jingle",
    async (req, reply) => {
      if (!sessionUserId(req)) return reply.status(401).send({ error: "Not authenticated" });
      relayManager.stopJingle(req.params.guildId);
      reply.send({ ok: true });
    }
  );

  app.delete<{ Params: { guildId: string } }>("/guilds/:guildId/session", async (req, reply) => {
    if (!sessionUserId(req)) return reply.status(401).send({ error: "Not authenticated" });
    await relayManager.stop(req.params.guildId);
    reply.send({ ok: true });
  });

  app.post<{
    Params: { guildId: string };
    Body: { channelId: string };
  }>("/guilds/:guildId/session/targets", async (req, reply) => {
    if (!sessionUserId(req)) return reply.status(401).send({ error: "Not authenticated" });
    const { channelId } = req.body ?? {};
    if (!channelId) return reply.status(400).send({ error: "channelId is required" });
    try {
      const ok = await relayManager.addTarget(req.params.guildId, channelId);
      if (!ok) return reply.status(404).send({ error: "No active relay session" });
      reply.send({ ok: true });
    } catch (err) {
      reply.status(503).send({ error: (err as Error).message });
    }
  });

  app.delete<{ Params: { guildId: string; channelId: string } }>(
    "/guilds/:guildId/session/targets/:channelId",
    async (req, reply) => {
      if (!sessionUserId(req)) return reply.status(401).send({ error: "Not authenticated" });
      try {
        const ok = relayManager.removeTarget(req.params.guildId, req.params.channelId);
        if (!ok) return reply.status(404).send({ error: "Target not found" });
        reply.send({ ok: true });
      } catch (err) {
        reply.status(503).send({ error: (err as Error).message });
      }
    }
  );

  // ── Session sources ────────────────────────────────────────────────────

  app.post<{
    Params: { guildId: string };
    Body: { userId: string; channelId: string };
  }>("/guilds/:guildId/session/sources", async (req, reply) => {
    if (!sessionUserId(req)) return reply.status(401).send({ error: "Not authenticated" });
    const { userId, channelId } = req.body ?? {};
    if (!userId || !channelId) {
      return reply.status(400).send({ error: "userId and channelId are required" });
    }
    try {
      const ok = await relayManager.addSource(req.params.guildId, userId, channelId);
      if (!ok) return reply.status(404).send({ error: "No active relay session" });
      reply.send({ ok: true });
    } catch (err) {
      reply.status(503).send({ error: (err as Error).message });
    }
  });

  app.delete<{ Params: { guildId: string; userId: string } }>(
    "/guilds/:guildId/session/sources/:userId",
    async (req, reply) => {
      if (!sessionUserId(req)) return reply.status(401).send({ error: "Not authenticated" });
      const ok = await relayManager.removeSource(req.params.guildId, req.params.userId);
      if (!ok) return reply.status(404).send({ error: "Source not found" });
      reply.send({ ok: true });
    }
  );
}

type SessionRow = {
  target_channel_ids: string | null;
  source_entries: string | null;
} & Record<string, unknown>;

function parseSessionRow(row: SessionRow) {
  return {
    ...row,
    targetChannelIds: row.target_channel_ids ? row.target_channel_ids.split(",") : [],
    sources: row.source_entries
      ? row.source_entries.split(",").map((e) => {
          const idx = e.indexOf(":");
          return { user_id: e.slice(0, idx), channel_id: e.slice(idx + 1) };
        })
      : [],
  };
}

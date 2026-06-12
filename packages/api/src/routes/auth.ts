import type { FastifyInstance } from "fastify";
import { fetch } from "undici";
import { db } from "../db/schema.js";

const DISCORD_API = "https://discord.com/api/v10";

function cfg() {
  return {
    CLIENT_ID: process.env.DISCORD_CLIENT_ID!,
    CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET!,
    REDIRECT_URI: process.env.REDIRECT_URI ?? "http://localhost:5173/auth/callback",
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.get("/auth/discord", async (req, reply) => {
    const params = new URLSearchParams({
      client_id: cfg().CLIENT_ID,
      redirect_uri: cfg().REDIRECT_URI,
      response_type: "code",
      scope: "identify guilds",
    });
    reply.redirect(`${DISCORD_API}/oauth2/authorize?${params}`);
  });

  app.get<{ Querystring: { code: string } }>("/auth/callback", async (req, reply) => {
    const { code } = req.query;
    const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";

    if (!code) return reply.redirect(`${webOrigin}/?error=missing_code`);

    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg().CLIENT_ID,
        client_secret: cfg().CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: cfg().REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      return reply.redirect(`${webOrigin}/?error=token_exchange_failed`);
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const user = (await userRes.json()) as { id: string; username: string; avatar: string };

    db.prepare(`
      INSERT INTO users (id, username, avatar, access_token, refresh_token, token_expires_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, unixepoch())
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        avatar = excluded.avatar,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        token_expires_at = excluded.token_expires_at,
        updated_at = unixepoch()
    `).run(
      user.id,
      user.username,
      user.avatar,
      tokens.access_token,
      tokens.refresh_token,
      Math.floor(Date.now() / 1000) + tokens.expires_in
    );

    (req.session as unknown as Record<string, unknown>).userId = user.id;
    return reply.redirect(`${webOrigin}/dashboard`);
  });

  app.get("/auth/me", async (req, reply) => {
    const userId = (req.session as unknown as Record<string, unknown>).userId as string | undefined;
    if (!userId) return reply.status(401).send({ error: "Not authenticated" });

    const user = db.prepare("SELECT id, username, avatar FROM users WHERE id = ?").get(userId);
    if (!user) return reply.status(401).send({ error: "User not found" });

    reply.send(user);
  });

  app.post("/auth/logout", async (req, reply) => {
    await req.session.destroy();
    reply.send({ ok: true });
  });
}

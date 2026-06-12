import type { FastifyInstance } from "fastify";

const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DEFAULT_PERMISSIONS = "36701184";
const BOT_SCOPES = "bot applications.commands";

interface BotInvite {
  label: string;
  clientId: string;
  url: string;
}

function splitClientIds(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function createInviteUrl(clientId: string, permissions: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    permissions,
    scope: BOT_SCOPES,
  });

  return `${DISCORD_AUTHORIZE_URL}?${params.toString()}`;
}

function toInvites(labelPrefix: string, clientIds: string[], permissions: string): BotInvite[] {
  return clientIds.map((clientId, index) => ({
    label: clientIds.length === 1 ? labelPrefix : `${labelPrefix} ${index + 1}`,
    clientId,
    url: createInviteUrl(clientId, permissions),
  }));
}

export async function configRoutes(app: FastifyInstance) {
  app.get("/config/bot-invites", async () => {
    const permissions =
      process.env.BOT_INVITE_PERMISSIONS ||
      process.env.VITE_BOT_INVITE_PERMISSIONS ||
      DEFAULT_PERMISSIONS;
    const controlClientId = process.env.DISCORD_CLIENT_ID;
    const listenerClientIds = splitClientIds(
      process.env.LISTENER_BOT_CLIENT_IDS || process.env.VITE_LISTENER_BOT_CLIENT_IDS
    );
    const speakerClientIds = splitClientIds(
      process.env.SPEAKER_BOT_CLIENT_IDS || process.env.VITE_SPEAKER_BOT_CLIENT_IDS
    );

    return [
      ...toInvites("Control bot", controlClientId ? [controlClientId] : [], permissions),
      ...toInvites("Listener bot", listenerClientIds, permissions),
      ...toInvites("Speaker bot", speakerClientIds, permissions),
    ];
  });
}

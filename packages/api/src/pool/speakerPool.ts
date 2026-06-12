import { Client, GatewayIntentBits } from "discord.js";

interface PoolEntry {
  client: Client;
  inUse: boolean;
}

class BotPool {
  private entries: PoolEntry[] = [];

  async init(tokens: string[]): Promise<void> {
    await Promise.all(
      tokens.map(async (token) => {
        const client = new Client({
          intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
        });
        await new Promise<void>((resolve) => {
          client.once("ready", () => resolve());
          client.login(token);
        });
        console.log(`[pool] bot ready: "${client.user?.tag}" (${client.user?.id})`);
        this.entries.push({ client, inUse: false });
      })
    );
  }

  async acquireForGuild(guildId: string): Promise<Client | null> {
    for (const entry of this.entries) {
      if (entry.inUse) continue;
      if (!entry.client.guilds.cache.has(guildId)) {
        const guild = await entry.client.guilds.fetch(guildId).catch(() => null);
        if (!guild) continue;
      }
      entry.inUse = true;
      return entry.client;
    }

    return null;
  }

  release(client: Client): void {
    const entry = this.entries.find((e) => e.client === client);
    if (entry) entry.inUse = false;
  }

  get size(): number {
    return this.entries.length;
  }

  get available(): number {
    return this.entries.filter((e) => !e.inUse).length;
  }
}

export const speakerPool = new BotPool();
export const listenerPool = new BotPool();

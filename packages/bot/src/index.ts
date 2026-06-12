import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });
import { Client, GatewayIntentBits, Collection } from "discord.js";
import { loadCommands } from "./commands/loader.js";
import { registerEvents } from "./events/index.js";
import type { Command } from "./types.js";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

export const commands = new Collection<string, Command>();

async function main() {
  await loadCommands(commands);
  registerEvents(client, commands);
  await client.login(process.env.DISCORD_TOKEN);
}

main().catch(console.error);

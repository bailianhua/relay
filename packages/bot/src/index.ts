import "dotenv/config";
import { Client, GatewayIntentBits, Collection } from "discord.js";
import { loadCommands } from "./commands/loader.js";
import { registerEvents } from "./events/index.js";
import type { Command } from "./types.js";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

export const commands = new Collection<string, Command>();

async function main() {
  await loadCommands(commands);
  registerEvents(client, commands);
  await client.login(process.env.DISCORD_TOKEN);
}

main().catch(console.error);

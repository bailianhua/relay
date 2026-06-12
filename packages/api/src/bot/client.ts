import { Client, GatewayIntentBits, Collection } from "discord.js";
import type { Command } from "./types.js";

export const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMembers],
});

export const commands = new Collection<string, Command>();

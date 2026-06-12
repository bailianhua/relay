import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";

export interface Command {
  data: SlashCommandBuilder | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export interface RelaySession {
  id: string;
  guildId: string;
  sourceChannelId: string;
  targetChannelIds: string[];
  shotcallerUserId: string;
  createdAt: number;
}

export interface RelayState {
  sessionId: string;
  active: boolean;
}

import { Client, Collection, Events } from "discord.js";
import type { Command } from "../types.js";

export function registerEvents(client: Client, commands: Collection<string, Command>) {
  client.once(Events.ClientReady, (c) => {
    console.log(`Discord bot ready: ${c.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Command ${interaction.commandName} failed:`, err);
      const msg = { content: "Something went wrong.", flags: 64 };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg);
      } else {
        await interaction.reply(msg);
      }
    }
  });
}

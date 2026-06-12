import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  MessageFlags,
} from "discord.js";
import { relayManager } from "../../relay/manager.js";
import type { Command } from "../types.js";

const data = new SlashCommandBuilder()
  .setName("relay")
  .setDescription("Manage voice relay sessions")
  .addSubcommand((sub) =>
    sub.setName("start").setDescription("Create a new relay session for this server")
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a target channel — the bot will speak here")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Voice channel to relay audio into")
          .addChannelTypes(ChannelType.GuildVoice)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a target channel from the relay")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Voice channel to remove")
          .addChannelTypes(ChannelType.GuildVoice)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Show relay status")
  )
  .addSubcommand((sub) =>
    sub.setName("stop").setDescription("Stop relay and disconnect from all channels")
  );

const execute = async (interaction: ChatInputCommandInteraction) => {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (sub === "start") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await relayManager.create({ controlClient: interaction.client, guildId });
    await interaction.editReply(
      "Session created. Use the web UI or `/relay add #channel` to add sources and targets."
    );
    return;
  }

  if (sub === "add") {
    const channel = interaction.options.getChannel("channel", true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ok = await relayManager.addTarget(guildId, channel.id);
    if (!ok) {
      await interaction.editReply("No active session. Run `/relay start` first.");
      return;
    }
    await interaction.editReply(`Bot is now in <#${channel.id}> and ready to relay.`);
    return;
  }

  if (sub === "remove") {
    const channel = interaction.options.getChannel("channel", true);
    const ok = relayManager.removeTarget(guildId, channel.id);
    await interaction.reply({
      content: ok ? `Removed <#${channel.id}>.` : "Channel not found in relay.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "status") {
    const session = relayManager.getActiveSession(guildId);
    if (!session) {
      await interaction.reply({ content: "No active relay.", flags: MessageFlags.Ephemeral });
      return;
    }
    const targets = session.targetChannelIds.map((id: string) => `<#${id}>`).join(", ") || "none";
    const sources = session.sources.map((s: { user_id: string }) => `<@${s.user_id}>`).join(", ") || "none";
    await interaction.reply({
      content: `**Relay active**\nSources: ${sources}\nTargets: ${targets}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "stop") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await relayManager.stop(guildId);
    await interaction.editReply("Relay stopped.");
  }
};

export default { data, execute } satisfies Command;

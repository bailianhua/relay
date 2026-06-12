import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
} from "discord.js";
import { relayManager } from "../relay/manager.js";
import type { Command } from "../types.js";

const data = new SlashCommandBuilder()
  .setName("relay")
  .setDescription("Manage voice relay sessions")
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("Start a new relay from this voice channel to others")
      .addChannelOption((opt) =>
        opt
          .setName("source")
          .setDescription("Voice channel you are in (the shotcaller channel)")
          .addChannelTypes(ChannelType.GuildVoice)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a target channel to the active relay")
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
    sub.setName("status").setDescription("Show current relay status")
  )
  .addSubcommand((sub) =>
    sub.setName("stop").setDescription("Stop the active relay and disconnect")
  );

const execute = async (interaction: ChatInputCommandInteraction) => {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (sub === "create") {
    const sourceChannel = interaction.options.getChannel("source", true);
    await interaction.deferReply({ ephemeral: true });

    const session = await relayManager.create({
      guildId,
      sourceChannelId: sourceChannel.id,
      shotcallerUserId: interaction.user.id,
    });

    await interaction.editReply(
      `Relay session started. Source: <#${sourceChannel.id}>\nUse \`/relay add\` to add target channels.`
    );
    return;
  }

  if (sub === "add") {
    const channel = interaction.options.getChannel("channel", true);
    await interaction.deferReply({ ephemeral: true });

    const ok = await relayManager.addTarget(guildId, channel.id);
    if (!ok) {
      await interaction.editReply("No active relay session. Use `/relay create` first.");
      return;
    }
    await interaction.editReply(`Now relaying into <#${channel.id}>.`);
    return;
  }

  if (sub === "remove") {
    const channel = interaction.options.getChannel("channel", true);
    await interaction.deferReply({ ephemeral: true });

    const ok = await relayManager.removeTarget(guildId, channel.id);
    if (!ok) {
      await interaction.editReply("No active relay or channel not found.");
      return;
    }
    await interaction.editReply(`Removed <#${channel.id}> from relay.`);
    return;
  }

  if (sub === "status") {
    const session = relayManager.getSession(guildId);
    if (!session) {
      await interaction.reply({ content: "No active relay.", ephemeral: true });
      return;
    }
    const targets = session.targetChannelIds.map((id) => `<#${id}>`).join(", ") || "none";
    await interaction.reply({
      content: `**Active relay**\nSource: <#${session.sourceChannelId}>\nTargets: ${targets}\nShotcaller: <@${session.shotcallerUserId}>`,
      ephemeral: true,
    });
    return;
  }

  if (sub === "stop") {
    await interaction.deferReply({ ephemeral: true });
    await relayManager.stop(guildId);
    await interaction.editReply("Relay stopped and all connections closed.");
  }
};

export default { data, execute } satisfies Command;

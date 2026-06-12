import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  VoiceConnectionStatus,
  entersState,
  VoiceReceiver,
  AudioPlayerStatus,
  StreamType,
  getVoiceConnection,
  EndBehaviorType,
  AudioPlayer,
  VoiceConnection,
} from "@discordjs/voice";
import { client } from "../index.js";
import { PassThrough, Readable } from "stream";
import type { RelaySession } from "../types.js";
import { randomUUID } from "crypto";

interface ActiveRelay {
  session: RelaySession;
  sourceConnection: VoiceConnection;
  targetConnections: Map<string, VoiceConnection>;
  targetPlayers: Map<string, AudioPlayer>;
  fanout: Set<PassThrough>;
}

class RelayManager {
  private relays = new Map<string, ActiveRelay>();

  async create(opts: {
    guildId: string;
    sourceChannelId: string;
    shotcallerUserId: string;
  }): Promise<RelaySession> {
    await this.stop(opts.guildId);

    const guild = client.guilds.cache.get(opts.guildId);
    if (!guild) throw new Error("Guild not found");

    const channel = guild.channels.cache.get(opts.sourceChannelId);
    if (!channel || !channel.isVoiceBased()) throw new Error("Channel not found");

    const sourceConnection = joinVoiceChannel({
      channelId: opts.sourceChannelId,
      guildId: opts.guildId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true,
    });

    await entersState(sourceConnection, VoiceConnectionStatus.Ready, 10_000);

    const session: RelaySession = {
      id: randomUUID(),
      guildId: opts.guildId,
      sourceChannelId: opts.sourceChannelId,
      targetChannelIds: [],
      shotcallerUserId: opts.shotcallerUserId,
      createdAt: Date.now(),
    };

    const relay: ActiveRelay = {
      session,
      sourceConnection,
      targetConnections: new Map(),
      targetPlayers: new Map(),
      fanout: new Set(),
    };

    this.relays.set(opts.guildId, relay);
    this.startListening(relay);
    return session;
  }

  private startListening(relay: ActiveRelay) {
    const receiver = relay.sourceConnection.receiver;

    relay.sourceConnection.on("stateChange", (_, newState) => {
      if (newState.status === VoiceConnectionStatus.Disconnected) {
        this.stop(relay.session.guildId);
      }
    });

    receiver.speaking.on("start", (userId) => {
      if (userId !== relay.session.shotcallerUserId) return;

      const opusStream = receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: 200 },
      });

      this.fanAudioToTargets(relay, opusStream as unknown as Readable);
    });
  }

  private fanAudioToTargets(relay: ActiveRelay, source: Readable) {
    const pipes: PassThrough[] = [];

    for (const [channelId, player] of relay.targetPlayers) {
      const pt = new PassThrough();
      relay.fanout.add(pt);
      pipes.push(pt);

      const resource = createAudioResource(pt, {
        inputType: StreamType.Opus,
        inlineVolume: false,
      });

      player.play(resource);

      pt.on("close", () => relay.fanout.delete(pt));
    }

    source.on("data", (chunk: Buffer) => {
      for (const pt of pipes) {
        if (!pt.destroyed) pt.write(chunk);
      }
    });

    source.on("end", () => {
      for (const pt of pipes) {
        if (!pt.destroyed) pt.end();
      }
    });

    source.on("error", (err) => {
      console.error("Source stream error:", err);
      for (const pt of pipes) {
        if (!pt.destroyed) pt.destroy(err);
      }
    });
  }

  async addTarget(guildId: string, channelId: string): Promise<boolean> {
    const relay = this.relays.get(guildId);
    if (!relay) return false;

    if (relay.targetConnections.has(channelId)) return true;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;

    const connection = joinVoiceChannel({
      channelId,
      guildId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

    const player = createAudioPlayer();
    connection.subscribe(player);

    relay.targetConnections.set(channelId, connection);
    relay.targetPlayers.set(channelId, player);
    relay.session.targetChannelIds.push(channelId);

    return true;
  }

  removeTarget(guildId: string, channelId: string): boolean {
    const relay = this.relays.get(guildId);
    if (!relay) return false;

    const conn = relay.targetConnections.get(channelId);
    if (!conn) return false;

    relay.targetPlayers.get(channelId)?.stop();
    conn.destroy();
    relay.targetConnections.delete(channelId);
    relay.targetPlayers.delete(channelId);
    relay.session.targetChannelIds = relay.session.targetChannelIds.filter(
      (id) => id !== channelId
    );

    return true;
  }

  getSession(guildId: string): RelaySession | undefined {
    return this.relays.get(guildId)?.session;
  }

  async stop(guildId: string): Promise<void> {
    const relay = this.relays.get(guildId);
    if (!relay) return;

    for (const pt of relay.fanout) pt.destroy();
    for (const [, player] of relay.targetPlayers) player.stop();
    for (const [, conn] of relay.targetConnections) conn.destroy();
    relay.sourceConnection.destroy();

    this.relays.delete(guildId);
  }

  getAllSessions(): RelaySession[] {
    return Array.from(this.relays.values()).map((r) => r.session);
  }
}

export const relayManager = new RelayManager();

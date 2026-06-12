import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
  EndBehaviorType,
  NoSubscriberBehavior,
  AudioPlayer,
  VoiceConnection,
  type DiscordGatewayAdapterCreator,
} from "@discordjs/voice";
import type { Client, Guild } from "discord.js";
import { PassThrough } from "stream";
import { randomUUID } from "crypto";
import { resolve } from "path";
import { statSync } from "fs";

const JINGLE_PATH = resolve(process.cwd(), "jingle.mp3");
import { db } from "../db/schema.js";
import { speakerPool, listenerPool } from "../pool/speakerPool.js";

interface SourceEntry {
  userId: string;
  channelId: string;
  listenerClient: Client;
  connection: VoiceConnection;
}

interface TargetEntry {
  channelId: string;
  speakerClient: Client;
  connection: VoiceConnection;
}

interface ActiveRelay {
  sessionId: string;
  guildId: string;
  player: AudioPlayer;
  sources: Map<string, SourceEntry>;
  targets: Map<string, TargetEntry>;
  jingleTimer?: ReturnType<typeof setInterval>;
  jingleIntervalMinutes?: number;
  jingleNextAt?: number;
}

async function resolveGuild(client: Client, guildId: string): Promise<Guild> {
  return client.guilds.cache.get(guildId) ?? client.guilds.fetch(guildId);
}

function safeDestroy(conn: VoiceConnection): void {
  try {
    conn.destroy();
  } catch {
    // already destroyed — ignore
  }
}

function assertJingleFile(): void {
  let stat;
  try {
    stat = statSync(JINGLE_PATH);
  } catch {
    throw new Error(`jingle.mp3 not found at ${JINGLE_PATH}`);
  }

  if (!stat.isFile()) {
    throw new Error(`jingle.mp3 is not a file at ${JINGLE_PATH}`);
  }
}

function createRelayPlayer(guildId: string): AudioPlayer {
  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  player.on("error", (err) => {
    console.error(`[audio-player] guild ${guildId} error:`, err);
  });
  player.on(AudioPlayerStatus.Idle, () => {
    console.log(`[audio-player] guild ${guildId} idle`);
  });
  return player;
}

function readActiveSession(guildId: string) {
  const row = db
    .prepare(
      `SELECT s.id, s.guild_id, s.active, s.created_at, s.stopped_at,
              GROUP_CONCAT(DISTINCT st.channel_id)              AS target_channel_ids,
              GROUP_CONCAT(DISTINCT ss.user_id || ':' || ss.channel_id) AS source_entries
       FROM sessions s
       LEFT JOIN session_targets st ON st.session_id = s.id
       LEFT JOIN session_sources ss ON ss.session_id = s.id
       WHERE s.guild_id = ? AND s.active = 1
       GROUP BY s.id
       LIMIT 1`
    )
    .get(guildId) as
    | ({
        target_channel_ids: string | null;
        source_entries: string | null;
      } & Record<string, unknown>)
    | undefined;

  if (!row) return null;

  return {
    ...row,
    targetChannelIds: row.target_channel_ids ? row.target_channel_ids.split(",") : [],
    sources: row.source_entries
      ? row.source_entries.split(",").map((e) => {
          const idx = e.indexOf(":");
          return { user_id: e.slice(0, idx), channel_id: e.slice(idx + 1) };
        })
      : [],
  };
}

class RelayManager {
  private relays = new Map<string, ActiveRelay>();

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async create(opts: { controlClient: Client; guildId: string }) {
    await this.stop(opts.guildId);

    const guild = await resolveGuild(opts.controlClient, opts.guildId);
    db.prepare(
      `INSERT INTO guilds (id, name, icon) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon`
    ).run(guild.id, guild.name, guild.icon ?? null);

    const sessionId = randomUUID();
    db.prepare("INSERT INTO sessions (id, guild_id, active) VALUES (?, ?, 1)").run(
      sessionId,
      opts.guildId
    );

    const relay: ActiveRelay = {
      sessionId,
      guildId: opts.guildId,
      player: createRelayPlayer(opts.guildId),
      sources: new Map(),
      targets: new Map(),
    };

    this.relays.set(opts.guildId, relay);
    return readActiveSession(opts.guildId)!;
  }

  async stop(guildId: string): Promise<void> {
    const relay = this.relays.get(guildId);
    if (!relay) return;

    this.stopJingle(guildId);
    relay.player.stop();

    for (const [, src] of relay.sources) {
      safeDestroy(src.connection);
      listenerPool.release(src.listenerClient);
    }
    for (const [, tgt] of relay.targets) {
      safeDestroy(tgt.connection);
      speakerPool.release(tgt.speakerClient);
    }

    db.prepare("UPDATE sessions SET active = 0, stopped_at = unixepoch() WHERE id = ?").run(
      relay.sessionId
    );

    this.relays.delete(guildId);
  }

  // ── Sources ────────────────────────────────────────────────────────────

  async addSource(guildId: string, userId: string, channelId: string): Promise<boolean> {
    const relay = this.relays.get(guildId);
    if (!relay) return false;
    if (relay.sources.has(userId)) return true;

    const listenerClient = await listenerPool.acquireForGuild(guildId);
    if (!listenerClient) {
      throw new Error("No listener bots available in this server. Invite a listener bot to the guild or wait for one to become free.");
    }

    let connection: VoiceConnection;
    try {
      const guild = await resolveGuild(listenerClient, guildId);
      connection = joinVoiceChannel({
        channelId,
        guildId,
        group: `source-${userId}`,
        adapterCreator: guild.voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator,
        selfDeaf: false,
        selfMute: true,
      });
      await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
      console.log(`[addSource] listener bot "${listenerClient.user?.tag}" (${listenerClient.user?.id}) joined channel ${channelId} for user ${userId}`);
    } catch (err) {
      listenerPool.release(listenerClient);
      throw err;
    }

    const source: SourceEntry = { userId, channelId, listenerClient, connection };
    relay.sources.set(userId, source);

    db.prepare(
      "INSERT OR REPLACE INTO session_sources (session_id, user_id, channel_id) VALUES (?, ?, ?)"
    ).run(relay.sessionId, userId, channelId);

    this.startListening(relay, source);
    return true;
  }

  async removeSource(guildId: string, userId: string): Promise<boolean> {
    const relay = this.relays.get(guildId);
    if (!relay) return false;

    const src = relay.sources.get(userId);
    if (!src) return false;

    safeDestroy(src.connection);
    listenerPool.release(src.listenerClient);
    relay.sources.delete(userId);

    db.prepare("DELETE FROM session_sources WHERE session_id = ? AND user_id = ?").run(
      relay.sessionId,
      userId
    );

    return true;
  }

  // ── Targets ────────────────────────────────────────────────────────────

  async addTarget(guildId: string, channelId: string): Promise<boolean> {
    const relay = this.relays.get(guildId);
    if (!relay) return false;
    if (relay.targets.has(channelId)) return true;

    const speakerClient = await speakerPool.acquireForGuild(guildId);
    if (!speakerClient) {
      throw new Error("No speaker bots available in this server. Invite a speaker bot to the guild or wait for one to become free.");
    }

    let connection: VoiceConnection;
    try {
      const guild = await resolveGuild(speakerClient, guildId);
      connection = joinVoiceChannel({
        channelId,
        guildId,
        group: `target-${channelId}`,
        adapterCreator: guild.voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator,
        selfDeaf: true,
        selfMute: false,
      });
      await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
      connection.subscribe(relay.player);
      console.log(`[addTarget] speaker bot "${speakerClient.user?.tag}" (${speakerClient.user?.id}) joined channel ${channelId}`);
    } catch (err) {
      console.error(`[addTarget] failed to join channel ${channelId}:`, err);
      speakerPool.release(speakerClient);
      throw err;
    }

    relay.targets.set(channelId, { channelId, speakerClient, connection });

    connection.on("stateChange", (_, newState) => {
      if (newState.status === VoiceConnectionStatus.Destroyed) {
        if (relay.targets.has(channelId)) {
          relay.targets.delete(channelId);
          speakerPool.release(speakerClient);
          db.prepare("DELETE FROM session_targets WHERE session_id = ? AND channel_id = ?").run(
            relay.sessionId,
            channelId
          );
        }
      }
    });

    db.prepare(
      "INSERT OR IGNORE INTO session_targets (session_id, channel_id) VALUES (?, ?)"
    ).run(relay.sessionId, channelId);

    return true;
  }

  removeTarget(guildId: string, channelId: string): boolean {
    const relay = this.relays.get(guildId);
    if (!relay) return false;

    const tgt = relay.targets.get(channelId);
    if (!tgt) return false;

    safeDestroy(tgt.connection);
    speakerPool.release(tgt.speakerClient);
    relay.targets.delete(channelId);

    db.prepare("DELETE FROM session_targets WHERE session_id = ? AND channel_id = ?").run(
      relay.sessionId,
      channelId
    );

    return true;
  }

  // ── Jingle ─────────────────────────────────────────────────────────────

  startJingle(guildId: string, intervalMinutes: number): boolean {
    const relay = this.relays.get(guildId);
    if (!relay) return false;

    this.stopJingle(guildId);

    assertJingleFile();

    const playJingle = () => {
      if (relay.targets.size === 0) {
        console.warn(`[jingle] skipped for guild ${guildId} — no target channels connected`);
        return;
      }
      const resource = createAudioResource(JINGLE_PATH);
      relay.player.play(resource);
      console.log(`[jingle] played for guild ${guildId}`);
    };

    const intervalMs = intervalMinutes * 60 * 1000;
    relay.jingleIntervalMinutes = intervalMinutes;
    relay.jingleNextAt = Date.now() + intervalMs;
    relay.jingleTimer = setInterval(() => {
      relay.jingleNextAt = Date.now() + intervalMs;
      playJingle();
    }, intervalMs);
    console.log(`[jingle] started — every ${intervalMinutes} min`);
    return true;
  }

  stopJingle(guildId: string): void {
    const relay = this.relays.get(guildId);
    if (!relay?.jingleTimer) return;
    clearInterval(relay.jingleTimer);
    relay.jingleTimer = undefined;
    relay.jingleIntervalMinutes = undefined;
    relay.jingleNextAt = undefined;
    console.log(`[jingle] stopped`);
  }

  // ── Restore on startup ─────────────────────────────────────────────────

  async restore(controlClient: Client): Promise<void> {
    const activeSessions = db
      .prepare("SELECT id, guild_id FROM sessions WHERE active = 1")
      .all() as Array<{ id: string; guild_id: string }>;

    for (const { id: sessionId, guild_id: guildId } of activeSessions) {
      try {
        const guild = await resolveGuild(controlClient, guildId);
        db.prepare(
          `INSERT INTO guilds (id, name, icon) VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon`
        ).run(guild.id, guild.name, guild.icon ?? null);

        const relay: ActiveRelay = {
          sessionId,
          guildId,
          player: createRelayPlayer(guildId),
          sources: new Map(),
          targets: new Map(),
        };
        this.relays.set(guildId, relay);

        const sources = db
          .prepare("SELECT user_id, channel_id FROM session_sources WHERE session_id = ?")
          .all(sessionId) as Array<{ user_id: string; channel_id: string }>;

        const targets = db
          .prepare("SELECT channel_id FROM session_targets WHERE session_id = ?")
          .all(sessionId) as Array<{ channel_id: string }>;

        for (const { user_id, channel_id } of sources) {
          try {
            await this.addSource(guildId, user_id, channel_id);
          } catch (err) {
            console.warn(`[restore] failed to rejoin source ${user_id} in ${channel_id}:`, err);
            db.prepare("DELETE FROM session_sources WHERE session_id = ? AND user_id = ?").run(
              sessionId,
              user_id
            );
          }
        }

        for (const { channel_id } of targets) {
          try {
            await this.addTarget(guildId, channel_id);
          } catch (err) {
            console.warn(`[restore] failed to rejoin target ${channel_id}:`, err);
            db.prepare("DELETE FROM session_targets WHERE session_id = ? AND channel_id = ?").run(
              sessionId,
              channel_id
            );
          }
        }

        console.log(
          `[restore] session ${sessionId} restored — ${relay.sources.size} source(s), ${relay.targets.size} target(s)`
        );
      } catch (err) {
        console.warn(`[restore] failed to restore session ${sessionId}:`, err);
        db.prepare("UPDATE sessions SET active = 0, stopped_at = unixepoch() WHERE id = ?").run(
          sessionId
        );
      }
    }
  }

  // ── Read ───────────────────────────────────────────────────────────────

  getActiveSession(guildId: string) {
    const session = readActiveSession(guildId);
    if (!session) return null;
    const relay = this.relays.get(guildId);
    return {
      ...session,
      jingleActive: !!relay?.jingleTimer,
      jingleIntervalMinutes: relay?.jingleIntervalMinutes ?? null,
      jingleNextAt: relay?.jingleNextAt ?? null,
    };
  }

  // ── Internal ───────────────────────────────────────────────────────────

  private startListening(relay: ActiveRelay, source: SourceEntry): void {
    const receiver = source.connection.receiver;

    receiver.speaking.on("start", (userId) => {
      if (userId !== source.userId) return;

      const opusStream = receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: 200 },
      });

      const pt = new PassThrough();
      const resource = createAudioResource(pt, {
        inputType: StreamType.Opus,
        inlineVolume: false,
      });
      relay.player.play(resource);

      opusStream.on("data", (chunk: Buffer) => {
        if (!pt.destroyed) pt.write(chunk);
      });
      opusStream.on("end", () => {
        if (!pt.destroyed) pt.end();
      });
      opusStream.on("error", (err) => {
        if (!pt.destroyed) pt.destroy(err);
      });
    });

    source.connection.on("stateChange", (_, newState) => {
      if (newState.status === VoiceConnectionStatus.Destroyed) {
        if (relay.sources.has(source.userId)) {
          relay.sources.delete(source.userId);
          listenerPool.release(source.listenerClient);
          db.prepare("DELETE FROM session_sources WHERE session_id = ? AND user_id = ?").run(
            relay.sessionId,
            source.userId
          );
        }
      }
    });
  }
}

export const relayManager = new RelayManager();

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  me: () => request<User>("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),
  botInvites: () => request<BotInvite[]>("/config/bot-invites"),

  // Guilds
  guilds: () => request<Guild[]>("/guilds"),
  guild: (guildId: string) => request<Guild>(`/guilds/${guildId}`),
  channels: (guildId: string) => request<VoiceChannel[]>(`/guilds/${guildId}/channels`),

  // Sessions (read)
  activeSesssion: (guildId: string) =>
    request<RelaySession | null>(`/guilds/${guildId}/sessions/active`),
  sessions: (guildId: string) => request<RelaySession[]>(`/guilds/${guildId}/sessions`),

  // Members
  members: (guildId: string) => request<Member[]>(`/guilds/${guildId}/members`),

  // Shotcallers
  shotcallers: (guildId: string) => request<Shotcaller[]>(`/guilds/${guildId}/shotcallers`),
  addShotcaller: (guildId: string, userId: string, displayName: string) =>
    request<Shotcaller>(`/guilds/${guildId}/shotcallers`, {
      method: "POST",
      body: JSON.stringify({ userId, displayName }),
    }),
  removeShotcaller: (guildId: string, userId: string) =>
    request(`/guilds/${guildId}/shotcallers/${userId}`, { method: "DELETE" }),

  // Session control
  startSession: (guildId: string) =>
    request<RelaySession>(`/guilds/${guildId}/session`, { method: "POST" }),
  stopSession: (guildId: string) =>
    request(`/guilds/${guildId}/session`, { method: "DELETE" }),
  addSource: (guildId: string, userId: string, channelId: string) =>
    request(`/guilds/${guildId}/session/sources`, {
      method: "POST",
      body: JSON.stringify({ userId, channelId }),
    }),
  removeSource: (guildId: string, userId: string) =>
    request(`/guilds/${guildId}/session/sources/${userId}`, { method: "DELETE" }),
  addTarget: (guildId: string, channelId: string) =>
    request(`/guilds/${guildId}/session/targets`, {
      method: "POST",
      body: JSON.stringify({ channelId }),
    }),
  removeTarget: (guildId: string, channelId: string) =>
    request(`/guilds/${guildId}/session/targets/${channelId}`, { method: "DELETE" }),

  startJingle: (guildId: string, intervalMinutes: number) =>
    request(`/guilds/${guildId}/session/jingle`, {
      method: "POST",
      body: JSON.stringify({ intervalMinutes }),
    }),
  stopJingle: (guildId: string) =>
    request(`/guilds/${guildId}/session/jingle`, { method: "DELETE" }),
};

export interface User {
  id: string;
  username: string;
  avatar: string | null;
}

export interface BotInvite {
  label: string;
  clientId: string;
  url: string;
}

export interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

export interface VoiceChannel {
  id: string;
  name: string;
  position: number;
}

export interface Member {
  id: string;
  displayName: string;
  username: string;
}

export interface Shotcaller {
  user_id: string;
  guild_id: string;
  display_name: string;
  created_at: number;
}

export interface RelaySource {
  user_id: string;
  channel_id: string;
}

export interface RelaySession {
  id: string;
  guild_id: string;
  active: number;
  created_at: number;
  stopped_at: number | null;
  sources: RelaySource[];
  targetChannelIds: string[];
  jingleActive: boolean;
  jingleIntervalMinutes: number | null;
  jingleNextAt: number | null;
}

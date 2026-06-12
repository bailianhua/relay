const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: () => request<User>("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),
  guilds: () => request<Guild[]>("/guilds"),
  activeSesssion: (guildId: string) =>
    request<RelaySession | null>(`/guilds/${guildId}/sessions/active`),
  sessions: (guildId: string) =>
    request<RelaySession[]>(`/guilds/${guildId}/sessions`),
};

export interface User {
  id: string;
  username: string;
  avatar: string | null;
}

export interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

export interface RelaySession {
  id: string;
  guild_id: string;
  source_channel_id: string;
  shotcaller_user_id: string;
  active: number;
  created_at: number;
  stopped_at: number | null;
  targetChannelIds: string[];
}

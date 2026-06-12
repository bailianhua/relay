import { useState, useEffect, useCallback } from "react";
import { api, type RelaySession } from "../lib/api.js";
import { relaySocket } from "../lib/ws.js";

export function useRelaySession(guildId: string | null) {
  const [session, setSession] = useState<RelaySession | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!guildId) return;
    setLoading(true);
    const data = await api.activeSesssion(guildId).catch(() => null);
    setSession(data);
    setLoading(false);
  }, [guildId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!guildId) return;
    relaySocket.connect();
    relaySocket.subscribe(guildId);
    return relaySocket.on((event) => {
      if (event.guildId === guildId) refresh();
    });
  }, [guildId, refresh]);

  return { session, loading, refresh };
}

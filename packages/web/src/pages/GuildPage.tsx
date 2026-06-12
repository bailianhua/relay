import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, type VoiceChannel, type Shotcaller, type Member } from "../lib/api.js";
import { useRelaySession } from "../hooks/useRelaySession.js";
import { StatusBadge } from "../components/StatusBadge.js";

export function GuildPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const navigate = useNavigate();
  const { session, loading: sessionLoading, refresh: refreshSession } = useRelaySession(
    guildId ?? null
  );

  const [guildName, setGuildName] = useState("");
  const [channels, setChannels] = useState<VoiceChannel[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [shotcallers, setShotcallers] = useState<Shotcaller[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add-source form
  const [newSourceUserId, setNewSourceUserId] = useState("");
  const [newSourceChannelId, setNewSourceChannelId] = useState("");

  // Add-target form
  const [targetChannelId, setTargetChannelId] = useState("");

  // Add-shotcaller form
  const [newMemberId, setNewMemberId] = useState("");

  // Jingle timer form
  const [jingleInterval, setJingleInterval] = useState(5);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!guildId) return;
    api.guild(guildId).then((g) => setGuildName(g.name)).catch(() => {});
    api.channels(guildId).then(setChannels).catch(() => {});
    api.members(guildId).then(setMembers).catch(() => {});
    api.shotcallers(guildId).then(setShotcallers).catch(() => {});
  }, [guildId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session?.jingleActive || !session.jingleNextAt) return;
    const refreshDelay = Math.max(1000, session.jingleNextAt - Date.now() + 1000);
    const timer = setTimeout(() => {
      void refreshSession();
    }, refreshDelay);
    return () => clearTimeout(timer);
  }, [session?.jingleActive, session?.jingleNextAt, refreshSession]);

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id;
  const shotcallerName = (userId: string) =>
    shotcallers.find((s) => s.user_id === userId)?.display_name ?? userId;

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const activeSourceUserIds = session?.sources.map((s) => s.user_id) ?? [];
  const activeTargetIds = session?.targetChannelIds ?? [];

  const availableShotcallers = shotcallers.filter(
    (s) => !activeSourceUserIds.includes(s.user_id)
  );
  const targetableChannels = channels.filter((c) => !activeTargetIds.includes(c.id));
  const jingleSecondsRemaining =
    session?.jingleNextAt && session.jingleActive
      ? Math.max(0, Math.ceil((session.jingleNextAt - now) / 1000))
      : null;
  const jingleCountdown =
    jingleSecondsRemaining === null
      ? null
      : `${Math.floor(jingleSecondsRemaining / 60)}:${String(jingleSecondsRemaining % 60).padStart(2, "0")}`;

  if (sessionLoading && !session) {
    return <div className="mx-auto max-w-3xl px-4 py-12 text-gray-500">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/dashboard")}
          className="text-sm text-gray-500 transition hover:text-gray-300"
        >
          ← Back
        </button>
        <h1 className="text-xl font-bold text-white">{guildName || "…"}</h1>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ── Relay Session ──────────────────────────────────────────────── */}
      <section className="space-y-5 rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">Relay Session</h2>
          <StatusBadge active={!!session?.active} />
        </div>

        {session ? (
          <>
            {/* Sources */}
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Sources (listener bots)
              </p>
              {session.sources.length === 0 ? (
                <p className="text-sm text-gray-600">No sources yet — add a shotcaller below.</p>
              ) : (
                session.sources.map((src) => (
                  <div
                    key={src.user_id}
                    className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"
                  >
                    <div className="text-sm">
                      <span className="text-gray-200">{shotcallerName(src.user_id)}</span>
                      <span className="ml-2 text-gray-500">in #{channelName(src.channel_id)}</span>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() =>
                        act(async () => {
                          await api.removeSource(guildId!, src.user_id);
                          await refreshSession();
                        })
                      }
                      className="text-xs text-red-400 transition hover:text-red-300 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}

              {availableShotcallers.length > 0 && (
                <div className="flex gap-2 pt-1">
                  <select
                    value={newSourceUserId}
                    onChange={(e) => setNewSourceUserId(e.target.value)}
                    className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                  >
                    <option value="">Shotcaller…</option>
                    {availableShotcallers.map((s) => (
                      <option key={s.user_id} value={s.user_id}>
                        {s.display_name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newSourceChannelId}
                    onChange={(e) => setNewSourceChannelId(e.target.value)}
                    className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                  >
                    <option value="">Their channel…</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={busy || !newSourceUserId || !newSourceChannelId}
                    onClick={() =>
                      act(async () => {
                        await api.addSource(guildId!, newSourceUserId, newSourceChannelId);
                        setNewSourceUserId("");
                        setNewSourceChannelId("");
                        await refreshSession();
                      })
                    }
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-500 disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>

            {/* Targets */}
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Targets (speaker bots)
              </p>
              {session.targetChannelIds.length === 0 ? (
                <p className="text-sm text-gray-600">No targets yet — add a channel below.</p>
              ) : (
                session.targetChannelIds.map((id) => (
                  <div
                    key={id}
                    className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"
                  >
                    <span className="text-sm text-gray-300">#{channelName(id)}</span>
                    <button
                      disabled={busy}
                      onClick={() =>
                        act(async () => {
                          await api.removeTarget(guildId!, id);
                          await refreshSession();
                        })
                      }
                      className="text-xs text-red-400 transition hover:text-red-300 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}

              {targetableChannels.length > 0 && (
                <div className="flex gap-2 pt-1">
                  <select
                    value={targetChannelId}
                    onChange={(e) => setTargetChannelId(e.target.value)}
                    className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                  >
                    <option value="">Add target channel…</option>
                    {targetableChannels.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={busy || !targetChannelId}
                    onClick={() =>
                      act(async () => {
                        await api.addTarget(guildId!, targetChannelId);
                        setTargetChannelId("");
                        await refreshSession();
                      })
                    }
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-500 disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>

            {/* Jingle Timer */}
            <div className="space-y-2 border-t border-white/10 pt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Jingle Timer
              </p>
              {session.jingleActive ? (
                <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                  <span className="text-sm text-gray-300">
                    Every {session.jingleIntervalMinutes} min
                    {jingleCountdown ? ` - next in ${jingleCountdown}` : ""}
                  </span>
                  <button
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        await api.stopJingle(guildId!);
                        await refreshSession();
                      })
                    }
                    className="text-xs text-red-400 transition hover:text-red-300 disabled:opacity-40"
                  >
                    Stop
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={jingleInterval}
                    onChange={(e) => setJingleInterval(Number(e.target.value))}
                    className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                    placeholder="min"
                  />
                  <span className="flex items-center text-sm text-gray-500">min</span>
                  <button
                    disabled={busy || jingleInterval < 1}
                    onClick={() =>
                      act(async () => {
                        await api.startJingle(guildId!, jingleInterval);
                        await refreshSession();
                      })
                    }
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-500 disabled:opacity-40"
                  >
                    Start
                  </button>
                </div>
              )}
            </div>

            {/* Stop relay */}
            <div className="border-t border-white/10 pt-2">
              <button
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await api.stopSession(guildId!);
                    await refreshSession();
                  })
                }
                className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
              >
                Stop Relay
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Start a session, then add shotcaller sources and team target channels.
            </p>
            <button
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await api.startSession(guildId!);
                  await refreshSession();
                })
              }
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
            >
              {busy ? "Starting…" : "Start Session"}
            </button>
          </div>
        )}
      </section>

      {/* ── Shotcallers ───────────────────────────────────────────────── */}
      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="font-semibold text-white">Shotcallers</h2>

        {shotcallers.length === 0 ? (
          <p className="text-sm text-gray-600">No shotcallers registered yet.</p>
        ) : (
          <div className="space-y-2">
            {shotcallers.map((s) => (
              <div
                key={s.user_id}
                className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"
              >
                <div>
                  <span className="text-sm text-gray-200">{s.display_name}</span>
                  <span className="ml-2 font-mono text-xs text-gray-500">{s.user_id}</span>
                </div>
                <button
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await api.removeShotcaller(guildId!, s.user_id);
                      setShotcallers((prev) => prev.filter((x) => x.user_id !== s.user_id));
                    })
                  }
                  className="text-xs text-red-400 transition hover:text-red-300 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 border-t border-white/10 pt-4">
          <select
            value={newMemberId}
            onChange={(e) => setNewMemberId(e.target.value)}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            <option value="">Select a server member…</option>
            {members
              .filter((m) => !shotcallers.some((s) => s.user_id === m.id))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                  {m.displayName !== m.username ? ` (${m.username})` : ""}
                </option>
              ))}
          </select>
          <button
            disabled={busy || !newMemberId}
            onClick={() =>
              act(async () => {
                const member = members.find((m) => m.id === newMemberId)!;
                const sc = await api.addShotcaller(guildId!, member.id, member.displayName);
                setShotcallers((prev) =>
                  [...prev.filter((x) => x.user_id !== sc.user_id), sc].sort((a, b) =>
                    a.display_name.localeCompare(b.display_name)
                  )
                );
                setNewMemberId("");
              })
            }
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-500 disabled:opacity-40"
          >
            Register
          </button>
        </div>
      </section>
    </div>
  );
}

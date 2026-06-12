import { useParams } from "react-router-dom";
import { useRelaySession } from "../hooks/useRelaySession.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { ChannelList } from "../components/ChannelList.js";

export function GuildPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const { session, loading } = useRelaySession(guildId ?? null);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-gray-500">Loading…</div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8 flex items-center gap-3">
        <h1 className="text-xl font-bold text-white">Relay Status</h1>
        <StatusBadge active={!!session?.active} />
      </div>

      {session ? (
        <div className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="grid grid-cols-2 gap-6">
            <ChannelList
              label="Source channel"
              channelIds={[session.source_channel_id]}
            />
            <ChannelList
              label="Target channels"
              channelIds={session.targetChannelIds}
            />
          </div>

          <div className="border-t border-white/10 pt-4">
            <p className="text-xs text-gray-500">
              Shotcaller:{" "}
              <span className="font-mono text-gray-300">{session.shotcaller_user_id}</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Started:{" "}
              <span className="text-gray-300">
                {new Date(session.created_at * 1000).toLocaleString()}
              </span>
            </p>
          </div>

          <div className="rounded-lg bg-gray-800/60 p-4 text-sm text-gray-400">
            <p className="font-medium text-gray-300 mb-1">Quick commands</p>
            <p>
              <code className="text-brand-500">/relay add #channel</code> — add a target
            </p>
            <p>
              <code className="text-brand-500">/relay remove #channel</code> — remove a target
            </p>
            <p>
              <code className="text-brand-500">/relay stop</code> — end the session
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center">
          <p className="text-gray-400">No active relay session.</p>
          <p className="mt-2 text-sm text-gray-600">
            Use{" "}
            <code className="text-brand-500">/relay create</code> in Discord to start one.
          </p>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { api, type Guild } from "../lib/api.js";
import { GuildCard } from "../components/GuildCard.js";
import { useAuth } from "../hooks/useAuth.js";

export function DashboardPage() {
  const { user, logout } = useAuth();
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .guilds()
      .then(setGuilds)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Your Servers</h1>
          <p className="text-sm text-gray-500">Logged in as {user?.username}</p>
        </div>
        <button
          onClick={logout}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-400 transition hover:text-white"
        >
          Logout
        </button>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading servers…</div>
      ) : guilds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-12 text-center text-gray-500">
          <p>No servers found.</p>
          <p className="mt-1 text-sm">Invite the bot to your server to get started.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {guilds.map((g) => (
            <GuildCard key={g.id} guild={g} />
          ))}
        </div>
      )}
    </div>
  );
}

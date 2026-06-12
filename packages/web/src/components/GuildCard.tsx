import type { Guild } from "../lib/api.js";
import { Link } from "react-router-dom";

interface Props {
  guild: Guild;
}

export function GuildCard({ guild }: Props) {
  const iconUrl = guild.icon
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
    : null;

  return (
    <Link
      to={`/guild/${guild.id}`}
      className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
    >
      {iconUrl ? (
        <img src={iconUrl} alt={guild.name} className="h-12 w-12 rounded-full" />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-white font-bold text-lg">
          {guild.name[0]}
        </div>
      )}
      <div>
        <p className="font-semibold text-white">{guild.name}</p>
        <p className="text-xs text-gray-500">{guild.id}</p>
      </div>
    </Link>
  );
}

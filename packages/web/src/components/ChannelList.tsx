interface Props {
  channelIds: string[];
  label: string;
}

export function ChannelList({ channelIds, label }: Props) {
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      {channelIds.length === 0 ? (
        <p className="text-sm text-gray-600 italic">None yet</p>
      ) : (
        <ul className="space-y-1">
          {channelIds.map((id) => (
            <li key={id} className="flex items-center gap-2 text-sm text-gray-300">
              <span className="text-gray-500">#</span>
              <span className="font-mono">{id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

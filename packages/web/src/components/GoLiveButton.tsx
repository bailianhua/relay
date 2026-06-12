import { useState, useRef } from "react";
import clsx from "clsx";
import { startMicStream, type MicStreamHandle } from "../lib/mic-stream.js";

interface Props {
  guildId: string;
  disabled?: boolean;
}

export function GoLiveButton({ guildId, disabled }: Props) {
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<MicStreamHandle | null>(null);

  const toggle = async () => {
    if (live) {
      handleRef.current?.stop();
      handleRef.current = null;
      setLive(false);
      setError(null);
      return;
    }

    try {
      setError(null);
      handleRef.current = await startMicStream(guildId);
      setLive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Mic access denied";
      setError(msg);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={toggle}
        disabled={disabled}
        className={clsx(
          "flex items-center gap-2 rounded-xl px-5 py-3 font-semibold transition",
          live
            ? "bg-red-500 hover:bg-red-600 text-white"
            : "bg-green-500 hover:bg-green-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
        )}
      >
        <span
          className={clsx(
            "h-2.5 w-2.5 rounded-full",
            live ? "bg-white animate-pulse" : "bg-white/70"
          )}
        />
        {live ? "Stop Broadcasting" : "Go Live"}
      </button>

      {live && (
        <p className="text-xs text-green-400">
          Your mic is live — audio is being relayed to all target channels.
        </p>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {!live && !disabled && (
        <p className="text-xs text-gray-500">
          Click to capture your mic and broadcast to all target channels.
        </p>
      )}

      {disabled && (
        <p className="text-xs text-gray-600">
          Add at least one target channel first with <code className="text-brand-500">/relay add</code>.
        </p>
      )}
    </div>
  );
}

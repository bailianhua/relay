import clsx from "clsx";

interface Props {
  active: boolean;
}

export function StatusBadge({ active }: Props) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        active ? "bg-green-500/20 text-green-400" : "bg-gray-700 text-gray-400"
      )}
    >
      <span
        className={clsx("h-1.5 w-1.5 rounded-full", active ? "bg-green-400 animate-pulse" : "bg-gray-500")}
      />
      {active ? "Live" : "Inactive"}
    </span>
  );
}

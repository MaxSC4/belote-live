import { cx } from "../../utils/cx";

interface AvatarCircleProps {
  avatarUrl?: string | null;
  fallback?: string;
  size?: "sm" | "md";
}

export function AvatarCircle(props: AvatarCircleProps) {
  const { avatarUrl, fallback, size = "md" } = props;
  const dimension = size === "sm" ? "h-7 w-7 text-xs" : "h-10 w-10 text-sm";
  const letter = fallback?.trim().charAt(0).toUpperCase() ?? "👤";

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={fallback ?? "Avatar"}
        className={cx("rounded-full object-cover ring-1 ring-slate-700/70", dimension)}
      />
    );
  }

  return (
    <div
      className={cx(
        "flex items-center justify-center rounded-full border border-slate-600/60 bg-slate-800/60 text-slate-200",
        dimension
      )}
    >
      {letter}
    </div>
  );
}

export default AvatarCircle;

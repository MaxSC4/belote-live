import AvatarCircle from "../common/AvatarCircle";
import type { TablePosition } from "../../types/table";
import type { PlayerStatsPayload, RoomPlayer } from "../../types/players";
import { cx } from "../../utils/cx";
import { Crown } from "lucide-react";

interface SeatBannerProps {
  position: TablePosition;
  player?: RoomPlayer;
  isCurrent: boolean;
  isSelf?: boolean;
  cardsCount?: number;
  isTrumpChooser?: boolean;
  avatarUrl?: string | null;
  stats?: PlayerStatsPayload;
}

export default function SeatBanner(props: SeatBannerProps) {
  const { position, player, isCurrent, isTrumpChooser, avatarUrl, stats } = props;

  const col = position === "left" ? 1 : position === "right" ? 3 : 2;
  const row = position === "top" ? 1 : position === "bottom" ? 3 : 2;

  if (!player) {
    return (
      <div
        className="text-xs text-slate-200/70"
        style={{ gridColumn: col, gridRow: row }}
      >
        {position === "bottom"
          ? "En attente de vous..."
          : "En attente d'un joueur..."}
      </div>
    );
  }

  const seatLabel = `J${(player.seat ?? 0) + 1}`;
  const label = player.nickname;
  const displayAvatar = avatarUrl ?? player?.avatarUrl ?? null;
  const statLine =
    stats && stats.games > 0
      ? `${Math.round(stats.winrate * 100)}% WR · ${stats.wins}W`
      : stats
      ? `${stats.wins}W`
      : null;

  return (
    <div
      className="flex flex-col items-center gap-1"
      style={{ gridColumn: col, gridRow: row }}
    >
      <div
        className={cx(
          "w-40 rounded-2xl border border-slate-700/60 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 shadow-[0_10px_25px_-20px_rgba(0,0,0,0.8)] transition",
          isCurrent && "border-emerald-300/70 shadow-[0_14px_30px_-20px_rgba(16,185,129,0.4)]",
          isTrumpChooser && "ring-1 ring-amber-300/70"
        )}
      >
        <div className="flex items-center gap-2">
          <AvatarCircle avatarUrl={displayAvatar} fallback={player?.nickname ?? "?"} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{label}</p>
            <p className="text-[0.55rem] uppercase tracking-[0.35em] text-slate-400">
              {seatLabel}
            </p>
          </div>
        </div>
        {statLine && (
          <p className="mt-1 text-[0.55rem] uppercase tracking-[0.35em] text-slate-400">
            {statLine}
          </p>
        )}
      </div>
      {isTrumpChooser && (
        <span className="inline-flex items-center gap-1 text-[0.55rem] font-semibold uppercase tracking-[0.35em] text-amber-100">
          <Crown className="h-3.5 w-3.5 text-amber-200" strokeWidth={2} />
          Preneur
        </span>
      )}
    </div>
  );
}

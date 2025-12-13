import AvatarCircle from "../common/AvatarCircle";
import CardBackFan from "./CardBackFan";
import type { TablePosition } from "../../types/table";
import type { PlayerStatsPayload, RoomPlayer } from "../../types/players";
import { cx } from "../../utils/cx";

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
  const {
    position,
    player,
    isCurrent,
    isSelf,
    cardsCount,
    isTrumpChooser,
    avatarUrl,
    stats,
  } = props;

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
  const label = isSelf
    ? `${player.nickname} (${seatLabel}, vous)`
    : `${player.nickname} (${seatLabel})`;

  const displayAvatar = avatarUrl ?? player?.avatarUrl ?? null;
  const statLine =
    stats && stats.games > 0
      ? `${Math.round(stats.winrate * 100)}% WR · ${stats.wins}W`
      : stats
      ? `${stats.wins}W`
      : null;

  return (
    <div
      className={cx(
        "inline-flex flex-col items-center gap-1 rounded-full border px-3 py-2 text-xs text-white transition",
        isCurrent
          ? "border-emerald-400/80 bg-emerald-500/20 shadow-[0_0_0_1px_rgba(16,185,129,0.4)]"
          : "border-slate-900/80 bg-slate-900/70",
        isTrumpChooser && "ring-2 ring-amber-300/70"
      )}
      style={{ gridColumn: col, gridRow: row }}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-3">
          <AvatarCircle
            avatarUrl={displayAvatar}
            fallback={player?.nickname ?? "?"}
            size="sm"
          />
          <span
            className={cx(
              "h-1.5 w-1.5 rounded-full",
              isCurrent ? "bg-emerald-400" : "bg-slate-500"
            )}
          />
          <span>{label}</span>
          {isTrumpChooser && (
            <span className="flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-500/20 px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.4em] text-amber-100">
              👑 Preneur
            </span>
          )}
        </div>
        {statLine && (
          <p className="text-[0.55rem] uppercase tracking-[0.4em] text-emerald-100/80">
            {statLine}
          </p>
        )}
        {!isSelf && (cardsCount ?? 0) > 0 && (
          <CardBackFan count={cardsCount ?? 0} />
        )}
      </div>
    </div>
  );
}

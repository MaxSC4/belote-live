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
  const label = isSelf ? `${player.nickname} (vous)` : player.nickname;
  const displayAvatar = avatarUrl ?? player?.avatarUrl ?? null;
  const statLine =
    stats && stats.games > 0
      ? `${Math.round(stats.winrate * 100)}% WR · ${stats.wins}W`
      : stats
      ? `${stats.wins}W`
      : null;

  return (
    <div
      className="flex flex-col items-center"
      style={{ gridColumn: col, gridRow: row }}
    >
      <div
        className={cx(
          "relative flex w-40 flex-col items-center gap-3 rounded-[1.25rem] border border-slate-600/70 bg-gradient-to-b from-[#1a2a24]/80 via-[#0e1914]/90 to-[#070d0b]/95 px-4 py-4 text-center text-xs text-white shadow-[0_18px_50px_-28px_rgba(0,0,0,0.8)] transition",
          isCurrent && "border-emerald-300/70 shadow-[0_22px_55px_-30px_rgba(16,185,129,0.5)]",
          isTrumpChooser && "ring-1 ring-amber-300/70"
        )}
      >
        <div className="flex w-full flex-col items-center gap-1">
          <span className="inline-flex w-full justify-center rounded-full border border-slate-700/70 px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.35em] text-slate-400">
            {seatLabel}
          </span>
          <AvatarCircle avatarUrl={displayAvatar} fallback={player?.nickname ?? "?"} />
          <p className="flex items-center justify-center gap-2 text-sm font-semibold text-white">
            <span className="max-w-[6rem] truncate">{label}</span>
            <span
              className={cx(
                "h-1.5 w-1.5 rounded-full",
                isCurrent ? "bg-emerald-400" : "bg-slate-600"
              )}
            />
          </p>
          {statLine && (
            <p className="text-[0.55rem] uppercase tracking-[0.35em] text-slate-400">
              {statLine}
            </p>
          )}
        </div>
        {!isSelf && (
          <div className="w-full rounded-2xl border border-emerald-200/10 bg-gradient-to-b from-emerald-950/40 to-slate-950/70 px-1 py-2 shadow-inner shadow-black/40">
            <CardBackFan count={cardsCount ?? 0} />
          </div>
        )}
      </div>
      {isTrumpChooser && (
        <span className="mt-2 inline-flex rounded-full border border-amber-300/70 bg-amber-500/20 px-3 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.35em] text-amber-100">
          Preneur
        </span>
      )}
    </div>
  );
}

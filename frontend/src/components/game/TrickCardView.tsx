import type { Card } from "../../gameTypes";
import type { TablePosition } from "../../types/table";
import { cx } from "../../utils/cx";
import CardSvg from "./cards/CardSvg";

interface TrickCardViewProps {
  position: TablePosition;
  card: Card;
  playerLabel: string;
}

export default function TrickCardView(props: TrickCardViewProps) {
  const { position, card, playerLabel } = props;

  const animationClass =
    position === "top"
      ? "animate-trick-from-top"
      : position === "bottom"
      ? "animate-trick-from-bottom"
      : position === "left"
      ? "animate-trick-from-left"
      : "animate-trick-from-right";

  const positionClass: Record<TablePosition, string> = {
    top: "-translate-x-1/2 -translate-y-[125%]",
    bottom: "-translate-x-1/2 translate-y-[35%]",
    left: "-translate-x-[165%] -translate-y-1/2",
    right: "translate-x-[65%] -translate-y-1/2",
  };

  const directionClass: Record<TablePosition, string> = {
    top: "flex-col",
    bottom: "flex-col-reverse",
    left: "flex-row",
    right: "flex-row-reverse",
  };

  const alignmentClass =
    position === "left"
      ? "items-center text-left"
      : position === "right"
      ? "items-center text-right"
      : "items-center text-center";

  const zIndex =
    position === "bottom"
      ? 40
      : position === "top"
      ? 35
      : position === "left"
      ? 38
      : 38;

  return (
    <div
      className={cx("absolute left-1/2 top-1/2", positionClass[position])}
      style={{ zIndex }}
    >
      <div
        className={cx(
          "flex gap-2 text-xs text-slate-100 drop-shadow-[0_20px_28px_rgba(0,0,0,0.55)]",
          directionClass[position],
          alignmentClass,
          animationClass
        )}
      >
        <div className="rounded-full border border-emerald-300/50 bg-slate-900/80 px-3 py-1 text-[0.58rem] uppercase tracking-[0.45em] text-emerald-100 shadow-inner shadow-black/50">
          {playerLabel}
        </div>
        <div className="relative">
          <CardSvg card={card} variant="trick" />
          <div className="pointer-events-none absolute inset-1 rounded-xl border border-white/10 shadow-inner shadow-emerald-200/10" />
        </div>
      </div>
    </div>
  );
}

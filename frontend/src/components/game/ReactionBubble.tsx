import type { TablePosition } from "../../types/table";
import { cx } from "../../utils/cx";

interface ReactionBubbleProps {
  position: TablePosition;
  emoji: string;
}

export default function ReactionBubble(props: ReactionBubbleProps) {
  const { position, emoji } = props;
  const positionClass: Record<TablePosition, string> = {
    top: "left-1/2 top-2 -translate-x-1/2 -translate-y-full",
    bottom: "left-1/2 bottom-2 -translate-x-1/2 translate-y-full",
    left: "left-[6%] top-1/2 -translate-x-full -translate-y-1/2",
    right: "right-[6%] top-1/2 translate-x-full -translate-y-1/2",
  };

  return (
    <div
      className={cx(
        "pointer-events-none absolute z-30 flex items-center justify-center text-3xl text-white drop-shadow-[0_10px_35px_rgba(0,0,0,0.45)]",
        positionClass[position]
      )}
    >
      <span className="rounded-full border border-emerald-300/70 bg-slate-950/85 px-4 py-2 shadow-[0_18px_35px_-20px_rgba(16,185,129,0.8)] animate-reaction-pop">
        {emoji}
      </span>
    </div>
  );
}

import { useEffect, useRef } from "react";
import anime from "animejs";
import type { TablePosition } from "../../types/table";
import { cx } from "../../utils/cx";

interface ReactionBubbleProps {
  position: TablePosition;
  emoji: string;
}

export default function ReactionBubble(props: ReactionBubbleProps) {
  const { position, emoji } = props;
  const bubbleRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!bubbleRef.current) return;
    anime.remove(bubbleRef.current);
    anime({
      targets: bubbleRef.current,
      keyframes: [
        { opacity: 0, scale: 0.4, translateY: 18, duration: 0 },
        { opacity: 1, scale: 1, translateY: 0, duration: 320, easing: "easeOutBack" },
        { translateY: -12, duration: 900, easing: "easeInOutSine" },
        { opacity: 0, scale: 0.85, translateY: -24, duration: 450, easing: "easeInQuad" },
      ],
      delay: 40,
    });
  }, [emoji, position]);
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
      <span
        ref={bubbleRef}
        className="rounded-full border border-emerald-300/70 bg-slate-950/85 px-4 py-2 shadow-[0_18px_35px_-20px_rgba(16,185,129,0.8)]"
      >
        {emoji}
      </span>
    </div>
  );
}

import { useEffect, useRef } from "react";
import anime from "animejs";
import type { Card } from "../../gameTypes";
import type { TablePosition } from "../../types/table";
import { cx } from "../../utils/cx";
import CardSvg from "./cards/CardSvg";

interface TrickCardViewProps {
  position: TablePosition;
  card: Card;
  playerLabel: string;
  order: number;
  collectTo?: TablePosition | null;
  stackIndex?: number;
  animationsEnabled: boolean;
  prefersReducedMotion: boolean;
}

const entryOffsets: Record<TablePosition, { x: number; y: number; tilt: number }> = {
  top: { x: 0, y: -90, tilt: -6 },
  bottom: { x: 0, y: 90, tilt: 6 },
  left: { x: -120, y: 0, tilt: -10 },
  right: { x: 120, y: 0, tilt: 10 },
};

const stackOffsets: Record<TablePosition, { x: number; y: number }> = {
  top: { x: 0, y: -140 },
  bottom: { x: 0, y: 140 },
  left: { x: -160, y: -10 },
  right: { x: 160, y: -10 },
};

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;

export default function TrickCardView(props: TrickCardViewProps) {
  const {
    position,
    card,
    playerLabel,
    order,
    collectTo,
    stackIndex = order,
    animationsEnabled,
    prefersReducedMotion,
  } = props;
  const motionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!motionRef.current) return;
    anime.remove(motionRef.current);

    if (!animationsEnabled || prefersReducedMotion) {
      motionRef.current.style.opacity = "1";
      motionRef.current.style.transform = "translateX(0px) translateY(0px) rotate(0deg) scale(1)";
      return;
    }

    const { x, y, tilt } = entryOffsets[position];
    const jitter = randomBetween(-2.5, 2.5);

    anime({
      targets: motionRef.current,
      keyframes: [
        {
          opacity: 0,
          translateX: x * 0.75,
          translateY: y * 0.75,
          rotateZ: tilt + jitter * 1.25,
          scale: 0.94,
          easing: "easeOutCubic",
          duration: 140,
        },
        {
          opacity: 1,
          translateX: x * 0.25,
          translateY: y * 0.25,
          rotateZ: (tilt + jitter) * 0.6,
          scale: 1.03,
          easing: "easeOutCubic",
          duration: 180,
        },
        {
          translateX: 0,
          translateY: 0,
          rotateZ: jitter * 0.35,
          scale: 1,
          easing: "easeOutBack",
          duration: 200,
        },
      ],
      delay: order * 95,
    });
  }, [
    card.rank,
    card.suit,
    playerLabel,
    position,
    order,
    animationsEnabled,
    prefersReducedMotion,
  ]);

  useEffect(() => {
    if (!motionRef.current || !collectTo) return;
    anime.remove(motionRef.current);

    const { x, y } = stackOffsets[collectTo];
    const stackTilt = randomBetween(-4, 4) + stackIndex * 1.5;
    const duration = prefersReducedMotion ? 180 : 420;

    if (!animationsEnabled) {
      motionRef.current.style.transform = `translateX(${x}px) translateY(${y}px) rotate(${stackTilt}deg) scale(0.95)`;
      motionRef.current.style.opacity = "0.9";
      return;
    }

    anime({
      targets: motionRef.current,
      translateX: x + randomBetween(-6, 6),
      translateY: y + randomBetween(-8, 4),
      rotateZ: stackTilt,
      scale: 0.95,
      opacity: 0.08,
      easing: "easeInOutCubic",
      duration,
    });
  }, [collectTo, stackIndex, animationsEnabled, prefersReducedMotion]);

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
        ref={motionRef}
        className={cx(
          "flex gap-2 text-xs text-slate-100 drop-shadow-[0_20px_28px_rgba(0,0,0,0.55)]",
          directionClass[position],
          alignmentClass
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

import { useId } from "react";

interface CardBackSvgProps {
  variant?: "mini" | "stack" | "fan";
}

const VIEWBOX_WIDTH = 169.075;
const VIEWBOX_HEIGHT = 244.64;

export default function CardBackSvg({ variant = "mini" }: CardBackSvgProps) {
  const sizeMap = {
    mini: { width: 34, height: 50 },
    stack: { width: 52, height: 72 },
    fan: { width: 48, height: 68 },
  } as const;
  const { width, height } = sizeMap[variant];
  const svgId = useId();
  const gradientId = `${svgId}-felt`;
  const overlayId = `${svgId}-overlay`;

  const backHref = `${import.meta.env.BASE_URL}belote-cards.svg#back`;

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      width={width}
      height={height}
      className="block drop-shadow-[0_12px_22px_rgba(2,6,23,0.65)]"
      role="img"
      aria-label="Dos de carte Belote Live"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#042f2e" />
          <stop offset="100%" stopColor="#064e3b" />
        </linearGradient>
        <linearGradient id={overlayId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(16,185,129,0.35)" />
          <stop offset="100%" stopColor="rgba(16,185,129,0.05)" />
        </linearGradient>
      </defs>
      <rect
        width={VIEWBOX_WIDTH}
        height={VIEWBOX_HEIGHT}
        rx={26}
        ry={26}
        fill={`url(#${gradientId})`}
      />
      <use
        href={backHref}
        xlinkHref={backHref}
        width={VIEWBOX_WIDTH}
        height={VIEWBOX_HEIGHT}
        style={{ fill: "rgba(8,145,178,0.4)" }}
      />
      <rect
        width={VIEWBOX_WIDTH - 18}
        height={VIEWBOX_HEIGHT - 18}
        x={9}
        y={9}
        rx={22}
        ry={22}
        fill={`url(#${overlayId})`}
      />
    </svg>
  );
}

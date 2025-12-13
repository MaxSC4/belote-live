import type { Card } from "../../../gameTypes";

type CardSizeVariant = "hand" | "trick" | "mini";

interface CardSvgProps {
  card: Card;
  variant?: CardSizeVariant;
  small?: boolean;
}

export default function CardSvg(props: CardSvgProps) {
  const { card, variant, small } = props;
  const isRed = card.suit === "♥" || card.suit === "♦";

  const sizeKey: CardSizeVariant = small ? "mini" : variant ?? "hand";
  const sizeByVariant: Record<CardSizeVariant, { width: number; height: number }> = {
    hand: { width: 88, height: 122 },
    trick: { width: 76, height: 108 },
    mini: { width: 52, height: 72 },
  };
  const { width, height } = sizeByVariant[sizeKey];

  return (
    <svg
      viewBox="0 0 52 72"
      width={width}
      height={height}
      className="block drop-shadow-[0_8px_14px_rgba(0,0,0,0.85)]"
    >
      <defs>
        <linearGradient id="card-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f1f5f9" />
        </linearGradient>
        <linearGradient id="card-border" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#cbd5f5" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
      </defs>

      <rect x={1} y={1} width={50} height={70} rx={7} ry={7} fill="url(#card-face)" stroke="url(#card-border)" strokeWidth={0.8} />
      <rect x={5} y={5} width={42} height={62} rx={5} ry={5} fill="#ffffff" stroke="#e2e8f0" strokeWidth={0.6} />

      <text x={7} y={16} fontSize={10} fontWeight="bold" fill={isRed ? "#e11d48" : "#0f172a"}>
        {card.rank}
      </text>
      <text x={7} y={28} fontSize={11} fill={isRed ? "#e11d48" : "#0f172a"}>
        {card.suit}
      </text>

      <g transform="rotate(180 26 36)">
        <text x={7} y={16} fontSize={10} fontWeight="bold" fill={isRed ? "#e11d48" : "#0f172a"}>
          {card.rank}
        </text>
        <text x={7} y={28} fontSize={11} fill={isRed ? "#e11d48" : "#0f172a"}>
          {card.suit}
        </text>
      </g>

      <circle cx={26} cy={36} r={16} fill="rgba(15,23,42,0.05)" stroke="rgba(148,163,184,0.4)" strokeWidth={0.5} />
      <circle cx={26} cy={36} r={10} fill="rgba(148,163,184,0.08)" />
      <text
        x={26}
        y={40}
        textAnchor="middle"
        fontSize={20}
        fontWeight="600"
        fill={isRed ? "#f43f5e" : "#0f172a"}
      >
        {card.suit}
      </text>
    </svg>
  );
}

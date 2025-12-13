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
        <linearGradient id="card-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f9fafb" />
          <stop offset="100%" stopColor="#e5e7eb" />
        </linearGradient>
      </defs>

      <rect
        x={1}
        y={1}
        width={50}
        height={70}
        rx={6}
        ry={6}
        fill="url(#card-bg)"
        stroke="#d1d5db"
        strokeWidth={1}
      />
      <rect
        x={4}
        y={4}
        width={44}
        height={64}
        rx={4}
        ry={4}
        fill="#f9fafb"
        stroke="#e5e7eb"
        strokeWidth={0.5}
      />

      <text
        x={8}
        y={16}
        fontSize={10}
        fontWeight="bold"
        fill={isRed ? "#b91c1c" : "#0f172a"}
      >
        {card.rank}
      </text>
      <text
        x={8}
        y={28}
        fontSize={11}
        fill={isRed ? "#b91c1c" : "#0f172a"}
      >
        {card.suit}
      </text>

      <g transform="rotate(180 26 36)">
        <text
          x={8}
          y={16}
          fontSize={10}
          fontWeight="bold"
          fill={isRed ? "#b91c1c" : "#0f172a"}
        >
          {card.rank}
        </text>
        <text
          x={8}
          y={28}
          fontSize={11}
          fill={isRed ? "#b91c1c" : "#0f172a"}
        >
          {card.suit}
        </text>
      </g>

      <text
        x={26}
        y={39}
        textAnchor="middle"
        fontSize={20}
        fill={isRed ? "#b91c1c" : "#0f172a"}
      >
        {card.suit}
      </text>
    </svg>
  );
}

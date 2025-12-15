import { useId } from "react";
import type { Card } from "../../../gameTypes";

type CardSizeVariant = "hand" | "trick" | "mini";

interface CardSvgProps {
  card: Card;
  variant?: CardSizeVariant;
  small?: boolean;
}

const VIEWBOX_WIDTH = 169.075;
const VIEWBOX_HEIGHT = 244.64;

const SUIT_ID: Record<Card["suit"], string> = {
  "♣": "club",
  "♦": "diamond",
  "♥": "heart",
  "♠": "spade",
};

const RANK_ID: Record<Card["rank"], string> = {
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
  J: "jack",
  Q: "queen",
  K: "king",
  A: "1",
};

const SIZE_BY_VARIANT: Record<CardSizeVariant, { width: number; height: number }> = {
  hand: { width: 94, height: 132 },
  trick: { width: 76, height: 108 },
  mini: { width: 54, height: 76 },
};

export default function CardSvg(props: CardSvgProps) {
  const { card, variant, small } = props;
  const sizeKey: CardSizeVariant = small ? "mini" : variant ?? "hand";
  const { width, height } = SIZE_BY_VARIANT[sizeKey];

  const svgId = useId();
  const glowId = `${svgId}-glow`;
  const textureId = `${svgId}-texture`;
  const accentGradientId = `${svgId}-accent`;
  const faceGradientId = `${svgId}-face`;
  const frameGradientId = `${svgId}-frame`;

  const cardKey = `${SUIT_ID[card.suit]}_${RANK_ID[card.rank]}`;
  const baseSpriteUrl = `${import.meta.env.BASE_URL}belote-cards.svg`;
  const cardHref = `${baseSpriteUrl}#${cardKey}`;

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      width={width}
      height={height}
      role="img"
      aria-label={`${card.rank} de ${card.suit}`}
      className="block"
    >
      <defs>
        <linearGradient id={accentGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(15,23,42,0.9)" />
          <stop offset="100%" stopColor="rgba(15,118,145,0.75)" />
        </linearGradient>
        <linearGradient id={faceGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id={frameGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(148,163,184,0.6)" />
          <stop offset="100%" stopColor="rgba(15,118,145,0.6)" />
        </linearGradient>
        <pattern id={textureId} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="none" />
          <circle cx="1" cy="1" r="0.7" fill="rgba(255,255,255,0.12)" />
          <circle cx="4.6" cy="4.4" r="0.4" fill="rgba(255,255,255,0.06)" />
        </pattern>
        <filter id={glowId} x="-30%" y="-20%" width="160%" height="180%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="rgba(2,6,23,0.55)" />
        </filter>
      </defs>

      <rect
        width={VIEWBOX_WIDTH}
        height={VIEWBOX_HEIGHT}
        rx={26}
        ry={26}
        fill={`url(#${faceGradientId})`}
        stroke={`url(#${frameGradientId})`}
        strokeWidth={3}
        filter={`url(#${glowId})`}
        className="drop-shadow-[0_16px_28px_rgba(2,6,23,0.5)]"
      />
      <rect
        width={VIEWBOX_WIDTH - 12}
        height={VIEWBOX_HEIGHT - 12}
        x={6}
        y={6}
        rx={22}
        ry={22}
        fill="rgba(248,250,252,0.98)"
        stroke="rgba(15,23,42,0.08)"
        strokeWidth={2}
      />

      <rect
        width={VIEWBOX_WIDTH - 18}
        height={VIEWBOX_HEIGHT - 18}
        x={9}
        y={9}
        rx={20}
        ry={20}
        fill={`url(#${textureId})`}
        opacity={0.3}
      />

      <g style={{ filter: `drop-shadow(0px 10px 16px rgba(2,6,23,0.45))` }}>
        <use
          href={cardHref}
          xlinkHref={cardHref}
          width={VIEWBOX_WIDTH}
          height={VIEWBOX_HEIGHT}
          style={{ mixBlendMode: "multiply" }}
        />
      </g>

      <rect
        width={VIEWBOX_WIDTH - 18}
        height={VIEWBOX_HEIGHT * 0.4}
        x={9}
        y={VIEWBOX_HEIGHT * 0.6 - 2}
        rx={20}
        ry={20}
        fill={`url(#${accentGradientId})`}
        opacity={0.08}
        style={{ mixBlendMode: "soft-light" }}
      />
    </svg>
  );
}

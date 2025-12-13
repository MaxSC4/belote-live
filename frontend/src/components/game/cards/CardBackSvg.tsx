interface CardBackSvgProps {
  variant?: "mini" | "stack" | "fan";
}

export default function CardBackSvg(props: CardBackSvgProps) {
  const { variant = "mini" } = props;
  const sizeMap = {
    mini: { width: 34, height: 50 },
    stack: { width: 52, height: 72 },
    fan: { width: 48, height: 68 },
  } as const;
  const { width, height } = sizeMap[variant];

  return (
    <svg
      viewBox="0 0 52 72"
      width={width}
      height={height}
      className="block drop-shadow-[0_6px_10px_rgba(0,0,0,0.7)]"
    >
      <defs>
        <linearGradient id="card-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <pattern
          id="card-dots"
          x="0"
          y="0"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r="1" fill="#1f2937" />
        </pattern>
      </defs>
      <rect
        x={1}
        y={1}
        width={50}
        height={70}
        rx={6}
        ry={6}
        fill="url(#card-back)"
        stroke="#10b981"
        strokeWidth={0.7}
      />
      <rect
        x={4}
        y={4}
        width={44}
        height={64}
        rx={4}
        ry={4}
        fill="url(#card-dots)"
        stroke="#0f172a"
        strokeWidth={0.5}
      />
      <rect
        x={15}
        y={20}
        width={22}
        height={32}
        rx={6}
        fill="rgba(16,185,129,0.25)"
        stroke="rgba(16,185,129,0.6)"
        strokeWidth={0.8}
      />
    </svg>
  );
}

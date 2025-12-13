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
          <stop offset="0%" stopColor="#111827" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <pattern
          id="card-weave"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
        >
          <path d="M0 6 L6 0" stroke="#1f2937" strokeWidth="0.8" />
          <path d="M-1 1 L1 -1" stroke="#111827" strokeWidth="0.7" />
        </pattern>
        <linearGradient id="card-accent" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      <rect
        x={1}
        y={1}
        width={50}
        height={70}
        rx={7}
        ry={7}
        fill="url(#card-back)"
        stroke="#10b981"
        strokeWidth={0.8}
      />
      <rect
        x={4}
        y={4}
        width={44}
        height={64}
        rx={5}
        ry={5}
        fill="url(#card-weave)"
        stroke="#1f2937"
        strokeWidth={0.4}
      />
      <path
        d="M10 18 L42 18 L35 54 H17 Z"
        fill="rgba(5,150,105,0.08)"
        stroke="rgba(52,211,153,0.3)"
        strokeWidth={0.6}
      />
      <circle cx={26} cy={36} r={13} fill="rgba(15,23,42,0.75)" stroke="rgba(16,185,129,0.4)" strokeWidth={0.6} />
      <path
        d="M26 28 L32 36 L26 44 L20 36 Z"
        fill="url(#card-accent)"
        stroke="#064e3b"
        strokeWidth={0.5}
      />
      <circle cx={26} cy={36} r={3} fill="#0f172a" stroke="#34d399" strokeWidth={0.5} />
    </svg>
  );
}

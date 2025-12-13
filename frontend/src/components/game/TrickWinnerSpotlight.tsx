interface TrickWinnerSpotlightProps {
  winnerName: string;
}

export default function TrickWinnerSpotlight(props: TrickWinnerSpotlightProps) {
  const { winnerName } = props;
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
      <div className="relative flex flex-col items-center gap-4 rounded-[2.5rem] border border-emerald-300/70 bg-gradient-to-b from-emerald-900/95 via-slate-950/95 to-slate-950/95 px-10 py-8 text-center text-white shadow-[0_45px_95px_-40px_rgba(0,0,0,0.95)] animate-trick-spotlight">
        <div className="pointer-events-none absolute inset-0 -z-10 rounded-[2.9rem] bg-emerald-400/15 blur-3xl" />
        <div className="flex items-center gap-3 text-4xl leading-none text-emerald-200">
          <span>🏆</span>
          <span className="text-3xl font-black tracking-[0.2em] text-emerald-100">
            PLI GAGNÉ
          </span>
        </div>
        <p className="text-xs uppercase tracking-[0.65em] text-emerald-200">
          Bravo à
        </p>
        <p className="text-3xl font-black tracking-wide text-white drop-shadow">
          {winnerName}
        </p>
      </div>
    </div>
  );
}

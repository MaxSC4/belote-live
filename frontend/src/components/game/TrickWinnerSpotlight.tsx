import { useEffect, useRef } from "react";
import anime from "animejs/lib/anime.es.js";

interface TrickWinnerSpotlightProps {
  winnerName: string;
}

export default function TrickWinnerSpotlight(props: TrickWinnerSpotlightProps) {
  const { winnerName } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!panelRef.current) return;
    anime.remove(panelRef.current);
    anime({
      targets: panelRef.current,
      opacity: [0, 1],
      scale: [0.8, 1],
      rotateX: [-10, 0],
      duration: 480,
      easing: "easeOutBack",
    });
    if (glowRef.current) {
      anime.remove(glowRef.current);
      anime({
        targets: glowRef.current,
        opacity: [0, 1],
        scale: [0.6, 1.05],
        duration: 700,
        easing: "easeOutCubic",
      });
    }
    if (titleRef.current) {
      anime.remove(titleRef.current);
      anime({
        targets: titleRef.current,
        letterSpacing: ["0.05em", "0.2em"],
        duration: 600,
        easing: "easeOutExpo",
      });
    }
    if (nameRef.current) {
      anime.remove(nameRef.current);
      anime({
        targets: nameRef.current,
        translateY: [18, 0],
        opacity: [0, 1],
        duration: 520,
        delay: 120,
        easing: "easeOutQuint",
      });
    }
  }, [winnerName]);

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
      <div
        ref={panelRef}
        className="relative flex flex-col items-center gap-4 rounded-[2.5rem] border border-emerald-300/70 bg-gradient-to-b from-emerald-900/95 via-slate-950/95 to-slate-950/95 px-10 py-8 text-center text-white shadow-[0_45px_95px_-40px_rgba(0,0,0,0.95)]"
      >
        <div
          ref={glowRef}
          className="pointer-events-none absolute inset-0 -z-10 rounded-[2.9rem] bg-emerald-400/15 blur-3xl"
        />
        <div className="flex items-center gap-3 text-4xl leading-none text-emerald-200">
          <span>🏆</span>
          <span
            ref={titleRef}
            className="text-3xl font-black tracking-[0.2em] text-emerald-100"
          >
            PLI GAGNÉ
          </span>
        </div>
        <p className="text-xs uppercase tracking-[0.65em] text-emerald-200">
          Bravo à
        </p>
        <p
          ref={nameRef}
          className="text-3xl font-black tracking-wide text-white drop-shadow"
        >
          {winnerName}
        </p>
      </div>
    </div>
  );
}

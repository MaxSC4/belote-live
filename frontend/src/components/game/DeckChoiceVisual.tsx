import { useEffect, useRef } from "react";
import anime from "animejs";
import type { Card } from "../../gameTypes";
import CardBackSvg from "./cards/CardBackSvg";
import CardSvg from "./cards/CardSvg";

interface DeckChoiceVisualProps {
  turnedCard: Card | null;
}

export default function DeckChoiceVisual(props: DeckChoiceVisualProps) {
  const { turnedCard } = props;
  const stack = Array.from({ length: 4 });
  const stackRef = useRef<HTMLDivElement>(null);
  const turnedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stackRef.current) {
      const cards = stackRef.current.querySelectorAll(".deck-card");
      anime.remove(cards);
      anime({
        targets: cards,
        rotate: (_: unknown, i: number) => [-2 + i * 1.2, -1 + i * 1.5],
        translateY: (_: unknown, i: number) => [-i * 2, -i * 2],
        duration: 1600,
        direction: "alternate",
        easing: "easeInOutSine",
        loop: true,
        delay: anime.stagger(120),
      });
    }
    if (turnedRef.current) {
      anime.remove(turnedRef.current);
      anime({
        targets: turnedRef.current,
        translateY: [-4, 4],
        rotateZ: [-2, 2],
        duration: 2200,
        direction: "alternate",
        easing: "easeInOutQuad",
        loop: true,
      });
    }
  }, [turnedCard]);

  return (
    <div className="mb-5 flex flex-col items-center gap-3">
      <div className="relative flex items-center justify-center">
        <div ref={stackRef} className="relative h-28 w-36">
          {stack.map((_, idx) => (
            <div
              key={idx}
              className="deck-card absolute left-1/2 top-1/2"
              style={{
                transform: `translate(-50%, -50%) rotate(${idx * 4}deg) translateY(${-idx * 3}px)`,
              }}
            >
              <CardBackSvg variant="stack" />
            </div>
          ))}
        </div>
        {turnedCard && (
          <div ref={turnedRef} className="-ml-8 rotate-3">
            <CardSvg card={turnedCard} variant="trick" />
          </div>
        )}
      </div>
      <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
        Carte proposée
      </p>
    </div>
  );
}

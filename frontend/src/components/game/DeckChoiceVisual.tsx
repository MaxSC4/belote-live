import type { Card } from "../../gameTypes";
import CardBackSvg from "./cards/CardBackSvg";
import CardSvg from "./cards/CardSvg";

interface DeckChoiceVisualProps {
  turnedCard: Card | null;
}

export default function DeckChoiceVisual(props: DeckChoiceVisualProps) {
  const { turnedCard } = props;
  const stack = Array.from({ length: 4 });

  return (
    <div className="mb-5 flex flex-col items-center gap-3">
      <div className="relative flex items-center justify-center">
        <div className="relative h-28 w-36">
          {stack.map((_, idx) => (
            <div
              key={idx}
              className="absolute left-1/2 top-1/2"
              style={{
                transform: `translate(-50%, -50%) rotate(${idx * 4}deg) translateY(${-idx * 3}px)`,
              }}
            >
              <CardBackSvg variant="stack" />
            </div>
          ))}
        </div>
        {turnedCard && (
          <div className="-ml-8 rotate-3">
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

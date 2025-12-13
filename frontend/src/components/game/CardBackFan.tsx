import CardBackSvg from "./cards/CardBackSvg";

interface CardBackFanProps {
  count: number;
}

export default function CardBackFan(props: CardBackFanProps) {
  const { count } = props;
  const cardsToShow = Math.min(7, count);
  const cardsArray = Array.from({ length: cardsToShow });
  const angleSpread = 12;
  const startAngle = -((cardsToShow - 1) / 2) * angleSpread;

  return (
    <div className="relative mt-1 flex flex-col items-center gap-1">
      <div className="relative h-16 w-24">
        {cardsArray.map((_, idx) => {
          const angle = startAngle + idx * angleSpread;
          return (
            <div
              key={idx}
              className="absolute left-1/2 top-1/2"
              style={{
                transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-6px)`,
                zIndex: idx,
              }}
            >
              <CardBackSvg variant="fan" />
            </div>
          );
        })}
      </div>
      <span className="text-[0.65rem] uppercase tracking-[0.4em] text-slate-200">
        {count}
      </span>
    </div>
  );
}

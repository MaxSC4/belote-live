import CardBackSvg from "./cards/CardBackSvg";

interface CardBackFanProps {
  count: number;
}

export default function CardBackFan(props: CardBackFanProps) {
  const { count } = props;
  const cardsToShow = Math.min(7, count);
  const cardsArray = Array.from({ length: cardsToShow });
  const angleSpread = 18;
  const startAngle = -((cardsToShow - 1) / 2) * angleSpread;

  return (
    <div className="relative flex w-full flex-col items-center gap-2">
      <div className="relative h-16 w-full max-w-[7rem]">
        {cardsArray.map((_, idx) => {
          const angle = startAngle + idx * angleSpread;
          return (
            <div
              key={idx}
              className="absolute left-1/2 top-[60%]"
              style={{
                transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-8px)`,
                zIndex: idx,
              }}
            >
              <CardBackSvg variant="fan" />
            </div>
          );
        })}
      </div>
      <span className="z-10 mt-1 inline-flex h-6 w-12 items-center justify-center rounded-full border border-slate-500/70 bg-slate-950/90 px-2 text-[0.65rem] font-semibold text-slate-100">
        {count}
      </span>
    </div>
  );
}

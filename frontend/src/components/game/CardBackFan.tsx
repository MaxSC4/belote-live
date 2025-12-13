import CardBackSvg from "./cards/CardBackSvg";

interface CardBackFanProps {
  count: number;
}

export default function CardBackFan(props: CardBackFanProps) {
  const { count } = props;
  const cardsToShow = Math.min(4, count);
  const cardsArray = Array.from({ length: cardsToShow });

  return (
    <div className="flex items-center justify-between text-slate-200">
      <div className="flex -space-x-2">
        {cardsArray.map((_, idx) => (
          <div
            key={idx}
            className="rounded-md border border-slate-600/60 bg-slate-800/60 p-1"
          >
            <CardBackSvg variant="mini" />
          </div>
        ))}
      </div>
      <span className="rounded-full border border-slate-600/70 px-2 py-0.5 text-[0.6rem] font-semibold text-slate-100">
        {count}
      </span>
    </div>
  );
}

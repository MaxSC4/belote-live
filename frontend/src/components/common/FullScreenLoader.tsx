interface FullScreenLoaderProps {
  message: string;
}

export default function FullScreenLoader(props: FullScreenLoaderProps) {
  const { message } = props;
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-slate-700 bg-slate-900/80 px-8 py-6 text-sm shadow-[0_25px_50px_-28px_rgba(0,0,0,1)]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
        <p>{message}</p>
      </div>
    </div>
  );
}

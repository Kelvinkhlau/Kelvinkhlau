export default function ComingSoon({ title, phase }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="text-5xl">🛠️</div>
      <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-slate-400">Coming in {phase}</p>
    </div>
  );
}

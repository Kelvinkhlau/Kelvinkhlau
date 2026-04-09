export default function Navbar() {
  return (
    <header className="h-14 border-b border-slate-800 bg-slate-900/60 backdrop-blur flex items-center px-6">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded bg-brand-500" />
        <span className="font-semibold tracking-tight">Life Manager</span>
        <span className="text-xs text-slate-500 ml-2">v0.1.0</span>
      </div>
      <div className="ml-auto text-sm text-slate-400">
        Running on Mac mini
      </div>
    </header>
  );
}

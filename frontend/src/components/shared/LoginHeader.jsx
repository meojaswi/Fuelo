import { Link } from "react-router-dom";

export default function LoginHeader() {
  return (
    <header className="border-b border-white/10">
      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-3 sm:h-14 sm:px-4">
        {/* Brand */}
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to="/"
            className="shrink-0 font-mono font-extrabold tracking-[0.18em] transition hover:opacity-80"
          >
            <span className="text-[17px] text-white/70 sm:text-[18px]">fuelo</span>
            <span className="text-fuelo-coral">.</span>
          </Link>

          <span className="hidden truncate font-mono text-[10px] tracking-wide text-white/35 sm:block">
            ledger infrastructure
          </span>
        </div>

        {/* Navigation */}
        <nav
          aria-label="Primary"
          className="flex shrink-0 items-center gap-3 font-mono text-[10px] tracking-wide text-white/50 sm:gap-6 sm:text-[11px]"
        >
          <Link to="/pricing" className="transition hover:text-fuelo-coral">
            Pricing
          </Link>

          <Link
            to="/signup"
            className="border border-fuelo-coral/40 px-2.5 py-1.5 text-white transition hover:border-fuelo-coral hover:bg-fuelo-coral/10 sm:px-4 sm:py-2"
          >
            Sign up
          </Link>
        </nav>
      </div>
    </header>
  );
}

export default function LoginFooter() {
  return (
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-white/10 px-4 py-6 font-mono text-[11px] tracking-wide text-white/35">
      <p>© 2026 fuelo. All rights reserved.</p>

      <nav aria-label="Footer" className="flex items-center gap-4 sm:gap-5">
        <a href="#" className="transition hover:text-fuelo-coral">
          Privacy
        </a>
        <span aria-hidden="true" className="text-white/15">
          ·
        </span>
        <a href="#" className="transition hover:text-fuelo-coral">
          Terms
        </a>
        <span aria-hidden="true" className="text-white/15">
          ·
        </span>
        <a href="#" className="transition hover:text-fuelo-coral">
          Status
        </a>
      </nav>
    </footer>
  );
}

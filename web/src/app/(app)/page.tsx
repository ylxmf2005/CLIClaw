export default function AppHome() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-card">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-cyan-glow/30">
            <path d="M16 2L2 9l14 7 14-7-14-7zM2 23l14 7 14-7M2 16l14 7 14-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="mb-2 font-display text-lg font-semibold text-foreground/80">CLIClaw Control</h2>
        <p className="text-sm text-muted-foreground">Select a conversation to begin</p>
      </div>
    </div>
  );
}

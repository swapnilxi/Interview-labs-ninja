'use client';

/**
 * /login has no screen of its own. LoginModal (mounted in the root layout) sends the user back to the
 * page they came from and opens the login popup there; this is only what shows for that instant.
 */
export default function AuthModule() {
  return (
    <div role="status" className="min-h-[calc(100svh-60px)] flex items-center justify-center">
      <div className="w-[40px] h-[40px] border-4 mix-border-primary/30 border-t-primary rounded-full animate-spin" />
      <span className="sr-only">Opening login…</span>
    </div>
  );
}

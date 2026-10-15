/**
 * Suspense fallback for the AI LMS routes whose module reads the URL (useSearchParams, through
 * useUrlState): Next needs a boundary above any page that does, or `next build` fails for that route.
 * Same spinner RequireAuth shows while auth resolves, so nothing flickers between the two.
 */
export default function RouteSpinner() {
  return (
    <div
      className="min-h-[60vh] flex items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <div className="w-[40px] h-[40px] border-4 border-border border-t-primary rounded-full animate-spin" />
    </div>
  );
}

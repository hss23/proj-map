export function AppSkeleton() {
  return (
    <div className="flex h-dvh flex-col" aria-busy aria-label="Loading map search">
      <div className="h-14 border-b border-border bg-surface" />
      <div className="flex flex-1">
        <div className="hidden w-[380px] space-y-3 border-r border-border bg-surface p-3 md:block">
          <div className="h-10 animate-pulse rounded-xl bg-surface-2" />
          <div className="h-7 w-3/4 animate-pulse rounded-full bg-surface-2" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
        <div className="flex-1 animate-pulse bg-surface-2" />
      </div>
    </div>
  );
}

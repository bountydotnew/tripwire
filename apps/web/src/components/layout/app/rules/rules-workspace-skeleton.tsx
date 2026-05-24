export function RulesWorkspaceSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-6 md:px-[50px] md:py-8">
      <div className="flex w-full items-start justify-between">
        <div className="flex flex-col gap-1">
          <div className="h-7 w-16 rounded bg-white/5" />
          <div className="h-4 w-40 rounded bg-white/5" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <div key={i} className="h-[200px] w-full rounded-xl bg-white/5" />
        ))}
      </div>
      <div className="h-24 w-full rounded-xl bg-white/5" />
      <div className="h-24 w-full rounded-xl bg-white/5" />
    </div>
  )
}

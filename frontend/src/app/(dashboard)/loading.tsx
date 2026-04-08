export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      {/* Header Skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-48 bg-[#1E2230] rounded-lg animate-pulse" />
        <div className="h-4 w-72 bg-[#1E2230] rounded animate-pulse" />
      </div>

      {/* Stats Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 space-y-3"
          >
            <div className="h-4 w-24 bg-[#1E2230] rounded animate-pulse" />
            <div className="h-10 w-16 bg-[#1E2230] rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Table Skeleton */}
      <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 space-y-4">
        <div className="h-5 w-36 bg-[#1E2230] rounded animate-pulse" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 w-12 bg-[#1E2230] rounded animate-pulse" />
            <div className="h-4 flex-1 bg-[#1E2230] rounded animate-pulse" />
            <div className="h-4 w-20 bg-[#1E2230] rounded animate-pulse" />
            <div className="h-4 w-24 bg-[#1E2230] rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

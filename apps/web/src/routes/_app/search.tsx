import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/search")({
  component: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h2 className="mb-2 text-xl font-medium text-white">Search</h2>
        <p className="text-sm text-tw-text-secondary">Coming soon</p>
      </div>
    </div>
  ),
})

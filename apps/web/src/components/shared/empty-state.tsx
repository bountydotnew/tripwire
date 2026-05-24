import { TripwireLogo } from "@tripwire/ui/icons/tripwire-logo"
import { Button } from "@tripwire/ui/button"

interface EmptyStateProps {
  title: string
  description: string
  action?: {
    label: string
    href: string
  }
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 px-8 py-24">
      <div className="bg-tw-surface-secondary flex h-16 w-16 items-center justify-center rounded-2xl border border-tw-border">
        <TripwireLogo className="h-8 w-8 text-tw-text-secondary" />
      </div>
      <div className="flex max-w-md flex-col items-center gap-2 text-center">
        <h2 className="text-lg font-medium text-white">{title}</h2>
        <p className="text-sm leading-relaxed text-tw-text-secondary">
          {description}
        </p>
      </div>
      {action && (
        <Button
          size="sm"
          variant="outline"
          className="border-[#CDCDCD] bg-white text-black hover:bg-white/90"
          render={<a href={action.href}>{action.label}</a>}
        />
      )}
    </div>
  )
}

import type * as React from "react"

interface SettingsSectionProps {
  title: string
  description?: string
  children: React.ReactNode
}

/**
 * Section wrapper: title (h3) + optional description sit on the inset
 * surface above the card containing the rows. Matches the Tripwire
 * pattern in general-page.tsx.
 */
export function SettingsSection({
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <header>
        <h3 className="text-[14px] font-semibold tracking-[-0.005em] text-tw-text-primary">
          {title}
        </h3>
        {description ? (
          <p className="mt-0.5 text-[13px] leading-snug text-tw-text-muted">
            {description}
          </p>
        ) : null}
      </header>
      <div className="overflow-hidden rounded-xl bg-tw-card">{children}</div>
    </section>
  )
}

// biome-ignore-all lint/correctness/noRestrictedElements: legacy file uses raw buttons

import { useEffect, useRef, useState, type ReactNode } from "react"
import type { RuleAction } from "@tripwire/db"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@tripwire/ui/dialog"
import { Button } from "@tripwire/ui/button"

export {
  ProfilePictureViz,
  LanguageViz,
  MergedPrsViz,
  AccountAgeViz,
  MaxPrsPerDayViz,
  MaxFilesChangedViz,
  RepoActivityViz,
  ProfileReadmeViz,
  CryptoViz,
  VouchedUsersViz,
} from "@tripwire/ui/icons/landing-visuals"

const ACTION_LABELS: Record<RuleAction, string> = {
  block: "Block",
  warn: "Warn",
  log: "Log only",
  threshold: "Threshold",
}

const ACTION_COLORS: Record<RuleAction, { active: string; chip: string }> = {
  block: { active: "text-red-400", chip: "bg-tw-inner text-tw-text-primary" },
  warn: { active: "text-amber-400", chip: "bg-tw-inner text-tw-text-primary" },
  log: { active: "text-white/60", chip: "bg-tw-inner text-tw-text-primary" },
  threshold: {
    active: "text-tw-accent",
    chip: "bg-tw-inner text-tw-text-primary",
  },
}

interface NumericConfig {
  value: number
  label: string
  onChange: (value: number) => void
}

export interface RuleScopeOverride {
  pullRequests?: boolean
  issues?: boolean
  comments?: boolean
}

export interface RepoContentScope {
  pullRequests: boolean
  issues: boolean
  comments: boolean
}

interface RuleCardGridProps {
  title: ReactNode
  /** Plain title for the modal header (no dropdowns) */
  modalTitle?: string
  description: string
  enabled: boolean
  action?: RuleAction
  onToggle: (enabled: boolean) => void
  onActionChange?: (action: RuleAction) => void
  visualization: ReactNode
  numericConfig?: NumericConfig
  /** Mark as coming soon - disables interaction */
  comingSoon?: boolean
  /**
   * Render-prop hint shown inside the Configure dialog. Receives a `close`
   * callback so the hint's action (e.g. "jump to Files tab") can dismiss
   * the modal after firing.
   */
  configureHint?: (props: { close: () => void }) => ReactNode
  /** Controlled open state for the Configure dialog. Omit for uncontrolled. */
  configureOpen?: boolean
  /** Called when the controlled Configure dialog wants to open/close. */
  onConfigureOpenChange?: (open: boolean) => void
  /** Repo-wide content-scope defaults (the "watching" toggles in the sidebar). */
  globalScope?: RepoContentScope
  /** Per-rule override on top of globalScope. Undefined fields inherit. */
  scopeOverride?: RuleScopeOverride
  /** Called when the user toggles a specific content type in the modal. */
  onScopeOverrideChange?: (override: RuleScopeOverride | undefined) => void
}

export function RuleCardGrid({
  title,
  modalTitle,
  description,
  enabled,
  action = "block",
  onToggle,
  onActionChange,
  visualization,
  numericConfig,
  comingSoon,
  configureHint,
  configureOpen: configureOpenProp,
  onConfigureOpenChange,
  globalScope,
  scopeOverride,
  onScopeOverrideChange,
}: RuleCardGridProps) {
  const [internalConfigureOpen, setInternalConfigureOpen] = useState(false)
  const configureOpen = configureOpenProp ?? internalConfigureOpen
  const setConfigureOpen = (open: boolean) => {
    if (configureOpenProp !== undefined) {
      onConfigureOpenChange?.(open)
    } else {
      setInternalConfigureOpen(open)
    }
  }
  const [actionEditing, setActionEditing] = useState(false)
  const [numericEditing, setNumericEditing] = useState(false)
  const [numericDraft, setNumericDraft] = useState(
    String(numericConfig?.value ?? 0)
  )
  const numericInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (numericConfig) setNumericDraft(String(numericConfig.value))
  }, [numericConfig?.value])

  useEffect(() => {
    if (numericEditing) {
      numericInputRef.current?.focus()
      numericInputRef.current?.select()
    }
  }, [numericEditing])

  const commitNumeric = () => {
    if (!numericConfig) return
    const val = Number(numericDraft)
    if (
      numericDraft !== "" &&
      Number.isFinite(val) &&
      val > 0 &&
      val !== numericConfig.value
    ) {
      numericConfig.onChange(Math.floor(val))
    } else {
      setNumericDraft(String(numericConfig.value))
    }
    setNumericEditing(false)
  }

  const handleCardClick = (e: React.MouseEvent) => {
    if (comingSoon) return
    // Don't toggle if clicking on interactive elements (dropdowns, buttons inside title)
    const target = e.target as HTMLElement
    if (
      target.closest("[data-dropdown]") ||
      target.closest("[data-action-select]") ||
      target.closest("button:not([data-card-toggle])")
    ) {
      return
    }
    onToggle(!enabled)
  }

  return (
    <>
      <div
        onClick={handleCardClick}
        className={`relative flex flex-col gap-3 rounded-xl border bg-tw-card p-3.5 transition-colors ${
          comingSoon
            ? "cursor-default border-tw-border-card"
            : enabled
              ? "cursor-pointer border-tw-accent/40 hover:bg-tw-hover-light"
              : "cursor-pointer border-tw-border-card hover:bg-tw-hover-light"
        }`}
      >
        {/* Visualization */}
        <div
          className={`pointer-events-none flex justify-center pt-2.5 pb-1 transition-all ${
            comingSoon
              ? "opacity-20 grayscale"
              : enabled
                ? "opacity-60"
                : "opacity-30 grayscale"
          }`}
        >
          {visualization}
        </div>

        {/* Content */}
        <div>
          <div
            className={`text-[15px] leading-5 font-medium tracking-[-0.3px] ${comingSoon ? "text-tw-text-tertiary" : "text-tw-text-primary"}`}
          >
            {title}
          </div>
          <div
            className={`mt-0.5 text-xs leading-4 ${comingSoon ? "text-tw-text-tertiary" : "text-tw-text-secondary"}`}
          >
            {description}
          </div>
        </div>

        {/* Action badge + numeric chip — only visible when enabled */}
        {enabled && !comingSoon && (
          <div className="flex items-center gap-2" data-action-select>
            {onActionChange && actionEditing ? (
              <div className="flex items-center gap-1">
                {(["block", "warn", "log"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onActionChange(a)
                      setActionEditing(false)
                    }}
                    className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
                      action === a
                        ? ACTION_COLORS[a].chip
                        : "border-tw-border bg-transparent text-tw-text-tertiary hover:border-tw-text-tertiary hover:text-tw-text-secondary"
                    }`}
                  >
                    {ACTION_LABELS[a]}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setActionEditing(false)
                  }}
                  className="px-1 py-0.5 text-[11px] text-tw-text-tertiary hover:text-tw-text-secondary"
                  aria-label="Close action picker"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (!onActionChange) return
                  setActionEditing(true)
                }}
                disabled={!onActionChange}
                className={`text-[11px] font-medium ${ACTION_COLORS[action].active} ${
                  onActionChange
                    ? "cursor-pointer underline-offset-2 hover:underline"
                    : ""
                }`}
                title={onActionChange ? "Change action" : undefined}
              >
                {ACTION_LABELS[action]}
              </button>
            )}
            {numericConfig &&
              (numericEditing ? (
                <input
                  ref={numericInputRef}
                  type="text"
                  inputMode="numeric"
                  value={numericDraft}
                  onChange={(e) => setNumericDraft(e.target.value)}
                  onBlur={commitNumeric}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      commitNumeric()
                    } else if (e.key === "Escape") {
                      e.preventDefault()
                      setNumericDraft(String(numericConfig.value))
                      setNumericEditing(false)
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-14 rounded-md border border-tw-accent/40 bg-tw-surface px-2 py-0.5 text-center text-[11px] font-medium text-tw-text-primary outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setNumericDraft(String(numericConfig.value))
                    setNumericEditing(true)
                  }}
                  className="cursor-pointer rounded-md bg-tw-surface px-2 py-0.5 text-[11px] font-medium text-tw-text-secondary hover:bg-tw-hover-light"
                  title={`Edit ${numericConfig.label.toLowerCase()}`}
                >
                  {numericConfig.value}
                </button>
              ))}
          </div>
        )}

        {/* Coming soon badge */}
        {comingSoon ? (
          <span className="absolute top-3 right-3 flex h-6 items-center rounded-md bg-tw-surface px-2.5 text-[11px] font-medium text-tw-text-tertiary">
            Coming soon
          </span>
        ) : enabled ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={(e) => {
              e.stopPropagation()
              setConfigureOpen(true)
            }}
            className="absolute top-3 right-3 h-6 bg-tw-button-muted px-2.5 text-[11px] text-white hover:bg-tw-button-muted-hover"
          >
            Configure
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            onClick={(e) => {
              e.stopPropagation()
              onToggle(true)
            }}
            className="absolute top-3 right-3 h-6 bg-tw-button-muted px-2.5 text-[11px] text-white hover:bg-tw-button-muted-hover"
          >
            Install
          </Button>
        )}
      </div>

      {/* Configure Modal */}
      <Dialog open={configureOpen} onOpenChange={setConfigureOpen}>
        <DialogContent
          showCloseButton
          className="w-full max-w-[400px] border-tw-border bg-tw-card p-0"
        >
          <DialogHeader className="px-5 pt-5 pb-4">
            <DialogTitle className="text-[15px] leading-5 font-medium text-tw-text-primary">
              {modalTitle ??
                (typeof title === "string" ? title : "Configure rule")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-5 px-5 pb-5">
            {configureHint ? (
              <div className="text-[12px] leading-snug text-tw-text-secondary">
                {configureHint({ close: () => setConfigureOpen(false) })}
              </div>
            ) : null}

            {/* Action level selector */}
            {onActionChange && (
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-tw-text-secondary">
                  Action level
                </label>
                <div className="flex flex-wrap items-center gap-1">
                  {(["block", "warn", "log"] as const).map((a) => (
                    <Button
                      variant="ghost"
                      key={a}
                      type="button"
                      onClick={() => onActionChange(a)}
                      className={`cursor-pointer rounded-md px-2.5 py-1 text-[12px] font-medium whitespace-nowrap transition-colors ${
                        action === a
                          ? ACTION_COLORS[a].chip
                          : "text-tw-text-tertiary hover:text-tw-text-secondary"
                      }`}
                    >
                      {ACTION_LABELS[a]}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Numeric config input */}
            {numericConfig && (
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-tw-text-secondary">
                  {numericConfig.label}
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <input
                      type="number"
                      value={numericConfig.value}
                      onChange={(e) => {
                        const val = Number.parseInt(e.target.value, 10)
                        if (!Number.isNaN(val) && val > 0) {
                          numericConfig.onChange(val)
                        }
                      }}
                      className="h-9 w-20 [appearance:textfield] rounded-lg border border-tw-border bg-tw-surface px-3 text-center text-[13px] text-tw-text-primary transition-colors outline-none focus:border-tw-accent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Content scope override */}
            {globalScope && onScopeOverrideChange && (
              <ScopeOverrideSection
                global={globalScope}
                override={scopeOverride}
                onChange={onScopeOverrideChange}
              />
            )}

            {/* Uninstall button */}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                onToggle(false)
                setConfigureOpen(false)
              }}
              className="mt-2 self-start text-[12px] text-tw-text-tertiary hover:text-red-400"
            >
              Uninstall rule
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

interface ScopeOverrideSectionProps {
  global: RepoContentScope
  override: RuleScopeOverride | undefined
  onChange: (next: RuleScopeOverride | undefined) => void
}

const SCOPE_TYPES: ReadonlyArray<{
  key: keyof RepoContentScope
  label: string
}> = [
  { key: "pullRequests", label: "Pull requests" },
  { key: "issues", label: "Issues" },
  { key: "comments", label: "Comments" },
]

function ScopeOverrideSection({
  global,
  override,
  onChange,
}: ScopeOverrideSectionProps) {
  const hasOverride =
    override !== undefined &&
    Object.values(override).some((v) => v !== undefined)

  const effective = (key: keyof RepoContentScope): boolean => {
    const o = override?.[key]
    return o !== undefined ? o : global[key]
  }

  const handleToggle = (key: keyof RepoContentScope) => {
    const current = effective(key)
    const next = !current
    // If the new value matches the global, clear the override for this key.
    // Otherwise, set it.
    const nextOverride: RuleScopeOverride = { ...(override ?? {}) }
    if (next === global[key]) {
      delete nextOverride[key]
    } else {
      nextOverride[key] = next
    }
    const anyLeft = Object.values(nextOverride).some((v) => v !== undefined)
    onChange(anyLeft ? nextOverride : undefined)
  }

  const handleReset = () => onChange(undefined)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-medium text-tw-text-secondary">
          Content scope
        </label>
        {hasOverride && (
          <Button
            variant="ghost"
            type="button"
            onClick={handleReset}
            className="text-[11px] text-tw-text-tertiary transition-colors hover:text-tw-text-secondary"
          >
            Reset to repo default
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {SCOPE_TYPES.map(({ key, label }) => {
          const on = effective(key)
          return (
            <Button
              variant="ghost"
              key={key}
              type="button"
              onClick={() => handleToggle(key)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-[12px] font-medium whitespace-nowrap transition-colors ${
                on
                  ? "bg-tw-inner text-tw-text-primary"
                  : "text-tw-text-tertiary hover:text-tw-text-secondary"
              }`}
            >
              {label}
            </Button>
          )
        })}
      </div>
      <p className="text-[11px] leading-snug text-tw-text-tertiary">
        {hasOverride
          ? "Override active — this rule ignores the repo's watching settings for the highlighted types."
          : "Inherits the repo's Watching settings. Tap to override per content type."}
      </p>
    </div>
  )
}

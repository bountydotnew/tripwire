interface FileContentEditorProps {
  /** Live preview content. Updates as the user edits, or as upstream config changes (phrases, rules). */
  value: string
  /** Called on every keystroke. */
  onChange: (next: string) => void
  /** Path shown in the footer (e.g. ".github/PULL_REQUEST_TEMPLATE.md"). */
  targetPath: string
  /** Whether the file gets pushed to GitHub on save. Controls the footer copy. */
  autoSync: boolean
  /** Extra description appended after the path (e.g. honeypot rotation note). */
  footerNote?: string
  rows?: number
}

export function FileContentEditor({
  value,
  onChange,
  targetPath,
  autoSync,
  footerNote,
  rows = 14,
}: FileContentEditorProps) {
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        spellCheck={false}
        className="w-full resize-y rounded-lg border border-tw-border bg-tw-inner p-2.5 font-mono text-[11px] leading-snug text-tw-text-secondary transition-colors outline-none focus:border-tw-accent"
        placeholder="Customize the content Tripwire commits to your repo…"
      />
      <p className="m-0 mt-1 text-[11px] leading-snug text-[#FFFFFF59]">
        {autoSync
          ? "Pushed to "
          : "Saved locally on save. Enable auto-sync to push to "}
        <code className="font-mono">{targetPath}</code>
        {autoSync ? " on save." : "."}
        {footerNote ? ` ${footerNote}` : ""}
      </p>
    </div>
  )
}

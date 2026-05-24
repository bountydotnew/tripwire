import { useState, useEffect, useMemo } from "react"
import { useFileTree, FileTree } from "@pierre/trees/react"
import { parseAsStringEnum, useQueryState } from "nuqs"
import { Button } from "@tripwire/ui/button"
import { Checkbox } from "@tripwire/ui/checkbox"
import { HoneypotMicroPlusIcon7 } from "@tripwire/ui/icons/honeypot-micro-plus-icon"
import type { RuleConfig, HoneypotPhraseKind } from "@tripwire/db"

function RenderedMarkdown({ content }: { content: string }) {
  const html = useMemo(() => renderMarkdown(content), [content])
  return (
    <div
      className="prose-file-preview h-full overflow-auto p-3 text-[12px] leading-[1.6] text-tw-text-secondary"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function renderMarkdown(md: string): string {
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  let html = escaped
    // Fenced code blocks
    .replace(
      /```(\w*)\n([\s\S]*?)```/g,
      (_m, lang, code) =>
        `<pre class="code-block"><code class="lang-${lang}">${code.trim()}</code></pre>`
    )
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // Headings
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic (* or _)
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/(?<!_)_([^_]+)_(?!_)/g, "<em>$1</em>")
    // Horizontal rule
    .replace(/^---$/gm, "<hr />")
    // Checkbox list items
    .replace(/^- \[x\] (.+)$/gm, '<li class="task checked">$1</li>')
    .replace(/^- \[ \] (.+)$/gm, '<li class="task">$1</li>')
    // Unordered list items
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    // Numbered list items
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    // HTML comments (show them faintly — they're the honeypot)
    .replace(
      /&lt;!-- ([\s\S]*?) --&gt;/g,
      '<div class="html-comment">&lt;!-- $1 --&gt;</div>'
    )
    // Paragraphs (blank line separated)
    .replace(/\n\n/g, "</p><p>")
    // Line breaks
    .replace(/\n/g, "<br />")

  // Wrap consecutive <li> in <ul>
  html = html.replace(
    /((?:<li[^>]*>.*?<\/li>\s*(?:<br \/>)?)+)/g,
    "<ul>$1</ul>"
  )
  // Clean up stray <br /> inside <ul>
  html = html.replace(
    /<ul>([\s\S]*?)<\/ul>/g,
    (_m, inner) => `<ul>${inner.replace(/<br \/>/g, "")}</ul>`
  )

  return `<p>${html}</p>`
}

interface RepoFilesTreeProps {
  config: RuleConfig
  repoFullName: string
  isPending: boolean
  generateRulesMd: (config: RuleConfig, repoFullName: string) => string
  generatePrTemplate: (config: RuleConfig, honeypotPhrase?: string) => string
  generateAgentsMd: (
    config: RuleConfig,
    repoFullName: string,
    honeypotPhrase?: string
  ) => string
  onUpdateContent: (
    kind: "rules-md" | "pr-template" | "agents-md",
    content: string
  ) => void
  onToggle: (path: string, value: boolean) => void
  onAddHoneypotPhrase: (
    target: "prTemplate" | "agentsMd",
    kind: HoneypotPhraseKind
  ) => void
  onRemoveHoneypotPhrase: (
    target: "prTemplate" | "agentsMd",
    index: number
  ) => void
}

type FileKey = "RULES.md" | "PULL_REQUEST_TEMPLATE.md" | "AGENTS.md"

const PATH_TO_FILE: Record<string, FileKey> = {
  ".github/RULES.md": "RULES.md",
  ".github/PULL_REQUEST_TEMPLATE.md": "PULL_REQUEST_TEMPLATE.md",
  ".github/AGENTS.md": "AGENTS.md",
}

const FILE_DESCRIPTIONS: Record<FileKey, string> = {
  "RULES.md":
    "Human-readable summary of your enabled rules, committed to the repo root.",
  "PULL_REQUEST_TEMPLATE.md":
    "Pre-fills every PR description with a checklist tied to your rules.",
  "AGENTS.md":
    "Instructions for AI coding agents. Contains hidden honeypot phrases that bots tend to include in their PRs.",
}

const HONEYPOT_KIND_LABEL: Record<HoneypotPhraseKind, string> = {
  codeword: "Codeword",
  marker: "Marker",
  natural: "Natural",
  tag: "Tag",
}

const HONEYPOT_KIND_HINT: Record<HoneypotPhraseKind, string> = {
  codeword: "Two random words + digits (e.g. cobalt-bridge-472)",
  marker: "Short code (e.g. TW-ACK-3F1A)",
  natural: "Natural-sounding sentence about reading the rules",
  tag: "Bracketed slug (e.g. [rules-confirmed])",
}

function getFileContent(
  file: FileKey,
  props: RepoFilesTreeProps
): { value: string; generated: string } {
  if (file === "RULES.md") {
    const generated = props.generateRulesMd(props.config, props.repoFullName)
    const custom = props.config.repoFiles.rulesMd.customContent
    return { value: custom.length > 0 ? custom : generated, generated }
  }
  if (file === "PULL_REQUEST_TEMPLATE.md") {
    const section = props.config.repoFiles.prTemplate
    const showHoneypot =
      section.honeypotEnabled && section.honeypotPhrases.length > 0
    const phrase = showHoneypot ? section.honeypotPhrases[0].phrase : undefined
    const generated = props.generatePrTemplate(props.config, phrase)
    const custom = section.customContent
    return { value: custom.length > 0 ? custom : generated, generated }
  }
  const section = props.config.repoFiles.agentsMd
  const showHoneypot =
    section.honeypotEnabled && section.honeypotPhrases.length > 0
  const phrase = showHoneypot ? section.honeypotPhrases[0].phrase : undefined
  const generated = props.generateAgentsMd(
    props.config,
    props.repoFullName,
    phrase
  )
  const custom = section.customContent
  return { value: custom.length > 0 ? custom : generated, generated }
}

function getContentKind(
  file: FileKey
): "rules-md" | "pr-template" | "agents-md" {
  if (file === "RULES.md") return "rules-md"
  if (file === "PULL_REQUEST_TEMPLATE.md") return "pr-template"
  return "agents-md"
}

function getTargetPath(file: FileKey): string {
  if (file === "RULES.md") return "RULES.md"
  if (file === "PULL_REQUEST_TEMPLATE.md")
    return ".github/PULL_REQUEST_TEMPLATE.md"
  return ".github/AGENTS.md"
}

function getAutoSyncKey(file: FileKey): string {
  if (file === "RULES.md") return "rulesMd.autoSync"
  if (file === "PULL_REQUEST_TEMPLATE.md") return "prTemplate.autoSync"
  return "agentsMd.autoSync"
}

function getAutoSync(file: FileKey, config: RuleConfig): boolean {
  if (file === "RULES.md") return config.repoFiles.rulesMd.autoSync
  if (file === "PULL_REQUEST_TEMPLATE.md")
    return config.repoFiles.prTemplate.autoSync
  return config.repoFiles.agentsMd.autoSync
}

function getHoneypotTarget(file: FileKey): "prTemplate" | "agentsMd" | null {
  if (file === "PULL_REQUEST_TEMPLATE.md") return "prTemplate"
  if (file === "AGENTS.md") return "agentsMd"
  return null
}

function HoneypotSection({
  target,
  config,
  isPending,
  onToggle,
  onAddPhrase,
  onRemovePhrase,
}: {
  target: "prTemplate" | "agentsMd"
  config: RuleConfig
  isPending: boolean
  onToggle: (path: string, value: boolean) => void
  onAddPhrase: (
    target: "prTemplate" | "agentsMd",
    kind: HoneypotPhraseKind
  ) => void
  onRemovePhrase: (target: "prTemplate" | "agentsMd", index: number) => void
}) {
  const section = config.repoFiles[target]
  const togglePath = `${target}.honeypotEnabled`

  return (
    <div className="flex flex-col gap-2">
      <label className="-mx-1 flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 select-none hover:bg-[#ffffff08]">
        <Checkbox
          checked={section.honeypotEnabled}
          onCheckedChange={(value) => onToggle(togglePath, value === true)}
          className="mt-0.5"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-[13px] text-[#FFFFFFCC]">
            Embed AI honeypot
          </span>
          <span className="text-[11px] leading-snug text-[#FFFFFF73]">
            Hidden instruction that AI agents follow. Pair with the{" "}
            <span className="text-tw-accent">AI honeypot</span> rule to catch
            them.
          </span>
        </span>
      </label>
      {section.honeypotEnabled && (
        <div className="ml-5 flex flex-col gap-1.5">
          <div className="text-[11px] text-[#FFFFFF59]">
            {section.honeypotPhrases.length === 0
              ? "No phrases yet. Add one to start trapping."
              : `${section.honeypotPhrases.length} phrase${section.honeypotPhrases.length === 1 ? "" : "s"} — one is picked at random on each sync.`}
          </div>
          {section.honeypotPhrases.length > 0 && (
            <div className="flex flex-col gap-1">
              {section.honeypotPhrases.map((p, i) => (
                <div
                  key={`${p.kind}-${i}`}
                  className="group flex items-center gap-2"
                >
                  <span className="w-[88px] shrink-0 text-[10px] tracking-wide text-[#FFFFFF59] uppercase">
                    {HONEYPOT_KIND_LABEL[p.kind]}
                  </span>
                  <code className="min-w-0 flex-1 truncate rounded bg-tw-inner px-1.5 py-0.5 font-mono text-[11px] text-tw-accent">
                    {p.phrase}
                  </code>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => onRemovePhrase(target, i)}
                    className="text-[11px] text-tw-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
                    title="Remove this phrase"
                  >
                    &times;
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="mr-1 text-[11px] text-[#FFFFFF73]">Add:</span>
            {(["codeword", "marker", "natural", "tag"] as const).map((kind) => (
              <Button
                key={kind}
                size="xs"
                variant="ghost"
                disabled={isPending}
                onClick={() => onAddPhrase(target, kind)}
                className="inline-flex items-center gap-1 border-none bg-transparent px-2 py-0.5 text-[11px] text-tw-text-tertiary hover:bg-tw-hover hover:text-tw-text-secondary"
                title={HONEYPOT_KIND_HINT[kind]}
              >
                <HoneypotMicroPlusIcon7 className="opacity-70" />
                {HONEYPOT_KIND_LABEL[kind]}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FileSettings({
  file,
  config,
  isPending,
  onToggle,
  onAddHoneypotPhrase,
  onRemoveHoneypotPhrase,
}: {
  file: FileKey
  config: RuleConfig
  isPending: boolean
  onToggle: (path: string, value: boolean) => void
  onAddHoneypotPhrase: (
    target: "prTemplate" | "agentsMd",
    kind: HoneypotPhraseKind
  ) => void
  onRemoveHoneypotPhrase: (
    target: "prTemplate" | "agentsMd",
    index: number
  ) => void
}) {
  const honeypotTarget = getHoneypotTarget(file)
  const autoSync = getAutoSync(file, config)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-tw-border-card bg-tw-card p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium tracking-[0.08em] text-tw-text-tertiary uppercase">
          Settings
        </span>
        <span className="text-[11px] text-tw-text-tertiary">
          {getTargetPath(file)}
        </span>
      </div>

      <p className="m-0 text-[12px] text-[#FFFFFF99]">
        {FILE_DESCRIPTIONS[file]}
      </p>

      <label className="-mx-1 flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[13px] text-[#FFFFFFCC] select-none hover:bg-[#ffffff08]">
        <Checkbox
          checked={autoSync}
          onCheckedChange={(value) =>
            onToggle(getAutoSyncKey(file), value === true)
          }
        />
        Auto-sync to GitHub on save
      </label>

      {honeypotTarget && (
        <div className="border-t border-white/[0.06] pt-2">
          <HoneypotSection
            target={honeypotTarget}
            config={config}
            isPending={isPending}
            onToggle={onToggle}
            onAddPhrase={onAddHoneypotPhrase}
            onRemovePhrase={onRemoveHoneypotPhrase}
          />
        </div>
      )}
    </div>
  )
}

const FILE_KEYS = ["RULES.md", "PULL_REQUEST_TEMPLATE.md", "AGENTS.md"] as const
const FILE_TREE_PATHS = [
  ".github/RULES.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/AGENTS.md",
]
const FILE_TO_PATH: Record<FileKey, string> = {
  "RULES.md": ".github/RULES.md",
  "PULL_REQUEST_TEMPLATE.md": ".github/PULL_REQUEST_TEMPLATE.md",
  "AGENTS.md": ".github/AGENTS.md",
}

export function RepoFilesTree(props: RepoFilesTreeProps) {
  const [activeFile, setActiveFile] = useQueryState(
    "file",
    parseAsStringEnum<FileKey>([...FILE_KEYS]).withDefault("AGENTS.md")
  )
  const [editorMode, setEditorMode] = useState<"preview" | "edit">("preview")

  const { model } = useFileTree({
    paths: FILE_TREE_PATHS,
    icons: "complete",
    initialExpansion: "open",
    initialSelectedPaths: [FILE_TO_PATH[activeFile]],
  })

  // Subscribe to model state changes and sync focused path to activeFile
  useEffect(() => {
    const unsub = model.subscribe(() => {
      const focused = model.getFocusedPath()
      if (focused && PATH_TO_FILE[focused]) {
        setActiveFile(PATH_TO_FILE[focused])
        setEditorMode("preview")
      }
    })
    return unsub
  }, [model, setActiveFile])

  // Resolve file content for the editor pane
  const fileContent = useMemo(() => {
    if (!activeFile) return null
    return getFileContent(activeFile, props)
  }, [activeFile, props])

  const handleContentChange = (next: string) => {
    if (!activeFile || !fileContent) return
    props.onUpdateContent(
      getContentKind(activeFile),
      next === fileContent.generated ? "" : next
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[12px] text-[#FFFFFF73]">
        Tripwire can commit files to your repo so contributors and AI agents see
        your rules upfront.
      </p>

      {/* Tree + Editor (IDE-style split) */}
      <div className="flex min-h-[360px] gap-0 overflow-hidden rounded-xl border border-tw-border-card">
        {/* File tree sidebar */}
        <div className="w-[220px] shrink-0 border-r border-tw-border-card bg-tw-card">
          <FileTree
            model={model}
            style={
              {
                height: "100%",
                fontSize: "13px",
                background: "var(--color-tw-card)",
                "--trees-bg-override": "var(--color-tw-card)",
                paddingTop: 8,
                "--trees-selected-bg-override": "var(--color-tw-card)",
                "--trees-selected-focused-border-color-override": "transparent",
                "--trees-file-icon-color-markdown": "#34A6FF",
              } as React.CSSProperties
            }
          />
        </div>

        {/* File content editor */}
        <div className="flex min-w-0 flex-1 flex-col bg-tw-card">
          {activeFile && fileContent ? (
            <>
              <div className="flex items-center justify-between border-b border-tw-border-card px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] text-tw-text-secondary">
                    {getTargetPath(activeFile)}
                  </span>
                  {getAutoSync(activeFile, props.config) && (
                    <span className="rounded bg-tw-accent/10 px-1.5 py-0.5 text-[10px] text-tw-accent">
                      synced
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-0.5">
                  {(["preview", "edit"] as const).map((m) => (
                    <Button
                      variant="ghost"
                      key={m}
                      type="button"
                      onClick={() => setEditorMode(m)}
                      className={`cursor-pointer rounded px-2 py-1 text-[11px] transition-colors ${
                        editorMode === m
                          ? "bg-tw-inner text-tw-text-primary"
                          : "text-tw-text-tertiary hover:text-tw-text-secondary"
                      }`}
                    >
                      {m === "preview" ? "Preview" : "Edit"}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {editorMode === "preview" ? (
                  <RenderedMarkdown content={fileContent.value} />
                ) : (
                  <textarea
                    value={fileContent.value}
                    onChange={(e) => handleContentChange(e.target.value)}
                    spellCheck={false}
                    className="h-full w-full resize-none bg-transparent p-3 font-mono text-[11px] leading-snug text-tw-text-secondary outline-none"
                    placeholder="Customize the content Tripwire commits to your repo…"
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-[13px] text-tw-text-tertiary">
              Select a file to view its contents
            </div>
          )}
        </div>
      </div>

      {/* Settings for the active file (below the tree+editor) */}
      {activeFile && (
        <FileSettings
          file={activeFile}
          config={props.config}
          isPending={props.isPending}
          onToggle={props.onToggle}
          onAddHoneypotPhrase={props.onAddHoneypotPhrase}
          onRemoveHoneypotPhrase={props.onRemoveHoneypotPhrase}
        />
      )}
    </div>
  )
}

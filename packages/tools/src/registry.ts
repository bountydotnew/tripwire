import type { z } from "zod"

// Every tool handler receives a ToolContext. The shared definitions
// never put `repoId` in their input schema — each adapter is
// responsible for surfacing it:
//   - MCP: prepends a `repoId` field to the schema the model sees,
//          extracts it from incoming args, places it in ctx.
//   - Chat: the chat session already has a repoId; the adapter
//          fills it from the chat ToolContext.
//
// This keeps handlers uniform and means a tool only declares the
// fields a user actually has to think about.

export interface ToolContext {
  userId: string
  /**
   * Better Auth active organization id. The chat surface supplies it
   * unconditionally so cross-org isolation is enforced even if a tool
   * is invoked with a `repoId` argument from the wrong org. MCP
   * adapters pass it through whenever the caller authenticated as an
   * org member.
   */
  orgId: string
  /** Display name. Present in chat; absent in MCP. */
  userName?: string
  /** Required for tools with needsRepo !== false. */
  repoId?: string
}
export type ToolSurface = "mcp" | "chat"

export const ALL_SURFACES = [
  "mcp",
  "chat",
] as const satisfies readonly ToolSurface[]

// Chat tools return a json-render spec. The shape mirrors what
// makeSpec() produced in the old AI tool layer.

export interface JsonRenderSpec {
  root: string
  elements: Record<
    string,
    {
      type: string
      props: Record<string, unknown>
      children?: string[]
    }
  >
}

export function makeSpec(
  type: string,
  props: Record<string, unknown>
): JsonRenderSpec {
  return {
    root: "main",
    elements: {
      main: { type, props, children: [] },
    },
  }
}
export interface ToolDefinition<
  TShape extends z.ZodRawShape = z.ZodRawShape,
  TOutput = unknown,
> {
  name: string
  description: string
  /**
   * Zod object schema for the tool's args. Do NOT include `repoId` here —
   * each adapter handles it. Use needsRepo to opt out of repo-scoping.
   */
  inputSchema: z.ZodObject<TShape>

  /**
   * Which surfaces register this tool. Defaults to both ("mcp" and "chat").
   * Set to a subset to make a tool surface-specific.
   *   - MCP-only: `surfaces: ["mcp"]`
   *   - Chat-only: `surfaces: ["chat"]`
   */
  surfaces?: readonly ToolSurface[]

  /**
   * Whether the tool's handler needs a repoId in ctx.
   * Default: true. Set to false for repo-agnostic tools (list_repos, get_guide).
   */
  needsRepo?: boolean

  /** Chat: tool requires explicit user approval before execution. */
  needsApproval?: boolean

  /** Chat: tool is rendered lazily. */
  lazy?: boolean

  /**
   * Whether the tool can be invoked directly from the UI (outside the chat
   * model loop), e.g. via a button on a rendered card. Defaults to false —
   * mutations and any tool that should only run after the model reasons
   * about it must keep this off. Useful for cheap follow-up reads like
   * "show the score breakdown" that should incur no LLM cost.
   */
  directInvokable?: boolean

  /**
   * Run the tool. The first arg is the parsed input; the second is the
   * ambient ctx (userId + repoId etc).
   */
  handler: (
    args: z.infer<z.ZodObject<TShape>>,
    ctx: ToolContext
  ) => Promise<TOutput>

  /**
   * Optional chat presenter: shape the handler output for the in-app UI.
   * If absent, falls back to an ActionResult card built from the output's
   * `ok` / `message` fields when present, or a generic "Done." card.
   */
  chatRender?: (
    output: TOutput,
    args: z.infer<z.ZodObject<TShape>>
  ) => JsonRenderSpec
}

/**
 * Type-safe tool factory. Captures the schema's inferred type into the
 * handler signature so each handler body sees concrete arg types.
 */
export function defineTool<TShape extends z.ZodRawShape, TOutput>(
  def: ToolDefinition<TShape, TOutput>
): ToolDefinition<TShape, TOutput> {
  return def
}

/**
 * Erased form used by adapters that iterate over a heterogeneous tool array.
 * TS variance keeps concrete `ToolDefinition<ConcreteShape, …>` from assigning to
 * `ToolDefinition<ZodRawShape, unknown>`; widening here is intentional.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous tools in one registry
export type AnyToolDefinition = ToolDefinition<any, any>

// Mutation handlers can return whatever they want, but most return
// this shape so the default chat presenter produces a usable card.

export interface MutationResult {
  ok: boolean
  message: string
  /** Optional structured payload; included verbatim in MCP, ignored by default chat. */
  data?: Record<string, unknown>
}
export function filterToolsForSurface(
  tools: readonly AnyToolDefinition[],
  surface: ToolSurface
): AnyToolDefinition[] {
  return tools.filter((tool) => {
    const surfaces = tool.surfaces ?? ALL_SURFACES
    return surfaces.includes(surface)
  })
}

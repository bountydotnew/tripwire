# Tripwire Development Guidelines

You are a professional software engineer. All code must follow best practices: accurate, readable, clean, and efficient.

## Global Standards

- **Comments**: Use JSDoc for exported functions/types only. No ASCII divider comments (`// ─── Section ───`). No decorative multi-line doc comments.
- **Styling**: Never use local classnames on componenets unless you really need to. Keep all styling to global tokens.
- **Package Manager**: Use `pnpm`, not `npm` or `yarn`.
- **Lint**:
  - **Repo root** (`pnpm lint`): runs **ESLint** on the monorepo (`eslint.config.js`), then **`pnpm --filter @tripwire/web lint`** (**Biome** rules for `apps/web` only — structural/import restrictions such as restricted elements).
  - **`apps/web` alone**: `pnpm --filter @tripwire/web lint` is Biome only; use root `pnpm lint` before CI-style checks.
  - ESLint ignores generated and tooling dirs: `node_modules`, `dist`, `.output`, `.turbo`, `.claude`, `.cursor`, `.tanstack`, `.nitro`, `.vinxi`, `**/routeTree.gen.ts`, etc.
- **Server/Client Boundary**: Never import `@tripwire/db` or `@tripwire/core` barrels in client code. Use subpath imports (`@tripwire/db/schema/rule-meta`, `@tripwire/core/rules/signal-registry`, `@tripwire/core/workflow-registry`) for pure-data modules. `import type` is always safe.
- **No Effects for Prop Sync**: Never use `useEffect` to sync props to state. Use `key` props to remount, derived state, or controlled components.

## Architecture

### Core Principles

1. Single Responsibility: Each component, hook, store has one clear purpose
2. Composition Over Complexity: Break down complex logic into smaller pieces
3. Type Safety First: TypeScript interfaces for all props, state, return types
4. No Helpers in Components: Put utility functions in `apps/web/src/lib/` or `packages/*/src/`, never inside component or tool files
5. Never use raw html components (<button>, <input>, <select><option></select>, etc). Always use their react counterparts defined in `apps/web/src/components/ui` (shared primitives such as `Button` live in `@tripwire/ui` and are re-exported under `#/components/ui` for the app).
   If you're unable to find the right component, explore the coss ui directory. `https://coss.com/ui/docs`
6. Never define a raw vector (`<svg`) outside `apps/web/src/components/icons/` (for the app) or `packages/ui/src/icons/` (for shared UI). Import icon components from there and follow the same patterns as existing icons.

### Root Structure

```
apps/
└── web/                       # TanStack Start app (UI + API routes + tRPC)
    ├── src/
    │   ├── components/        # Shared UI components
    │   │   ├── automations/   # Workflow editor, node types, templates
    │   │   ├── chat/          # AI chat panel, context, thread
    │   │   ├── layout/        # App shell, empty states
    │   │   ├── rules/         # Rule cards, custom rules tab, rule builder
    │   │   └── ui/            # Base UI primitives (button, dialog, etc.)
    │   ├── integrations/      # tRPC client/server setup + routers
    │   ├── lib/               # App-wide utilities
    │   ├── routes/            # TanStack file-based routes
    │   │   ├── _app/          # Authenticated app routes
    │   │   └── api/           # API routes (chat, webhook, tools, auth)
    │   └── types/             # Shared type declarations
    └── autumn.config.ts       # Billing/plan configuration

packages/
├── ai/                        # @tripwire/ai — system prompt, model config, credit metering
├── auth/                      # @tripwire/auth — Better Auth setup
├── core/                      # @tripwire/core — business logic (pipeline, scoring, rules, operations)
├── db/                        # @tripwire/db — Drizzle schema + client (Postgres)
├── env/                       # @tripwire/env — environment variable schemas
├── github/                    # @tripwire/github — GitHub API client
├── mcp/                       # @tripwire/mcp — MCP server adapter
├── ratelimit/                 # @tripwire/ratelimit — rate limiting
├── tools/                     # @tripwire/tools — tool definitions (MCP + chat)
└── ui/                        # @tripwire/ui — shared UI utilities (cn, etc.)
```

### Package Boundaries

- `apps/* -> packages/*` only. Packages never import from `apps/*`.
- Each package has explicit subpath `exports` in `package.json`. Use subpaths for client-safe imports to avoid pulling server-only dependencies (Drizzle, pg) into the browser bundle.
- Auth is shared via Better Auth with Autumn for billing.

### Naming Conventions

- Components: PascalCase (`RuleCardGrid`)
- Hooks: `use` prefix (`useWorkspace`)
- Files: kebab-case (`rule-card-grid.tsx`)
- Constants: SCREAMING_SNAKE_CASE
- Interfaces: PascalCase with suffix (`WorkflowEditorProps`)

## Imports

Use path aliases. `#/` maps to `apps/web/src/`.

```typescript
// Good
import { useTRPC } from "#/integrations/trpc/react"
import { formatCamelCase } from "#/lib/format"

// Bad
import { useTRPC } from "../../../integrations/trpc/react"
```

Use `import type { X }` for type-only imports. This is critical for the server/client boundary.

### Import Order

1. React/core libraries
2. External libraries
3. UI components (`#/components/ui/`)
4. Utilities (`#/lib/`)
5. Feature imports
6. Package imports (`@tripwire/*`)

## TypeScript

1. No `any` — use proper types or `unknown` with type guards
2. Always define props interface for components
3. `as const` for constant objects/arrays
4. Explicit ref types: `useRef<HTMLDivElement>(null)`

## Components

```typescript
interface ComponentProps {
  requiredProp: string
  optionalProp?: boolean
}

export function Component({
  requiredProp,
  optionalProp = false,
}: ComponentProps) {
  // Order: refs -> external hooks -> state -> useMemo -> useCallback -> return
}
```

Extract when: 50+ lines, used in 2+ files, or has own state/logic. Keep inline when: < 10 lines, single use, purely presentational.

## tRPC Routers

All server state mutations go through tRPC routers in `apps/web/src/integrations/trpc/routers/`. Each router uses `authedProcedure` for auth:

```typescript
export const featureRouter = {
  list: authedProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ input, ctx }) => { ... }),
  create: authedProcedure
    .input(createSchema)
    .mutation(async ({ input, ctx }) => { ... }),
} satisfies TRPCRouterRecord;
```

Register in `apps/web/src/integrations/trpc/router.ts`.

## Tool Definitions

Tools live in `packages/tools/src/definitions/`. Each tool follows `ToolDefinition`:

```typescript
defineTool({
  name: "tool_name",
  description: "What it does",
  inputSchema: z.object({ ... }),  // Never include repoId — adapters handle it
  surfaces: ["chat", "mcp"],       // Where the tool is exposed
  needsApproval: true,             // Requires user confirmation
  needsRepo: true,                 // Needs a repo context (default true)
  handler: async (input, ctx) => { ... },
  chatRender: (result) => makeSpec("CardType", { ... }),
})
```

Register in `packages/tools/src/index.ts`.

### Adding a New Tool

1. Create the tool in `packages/tools/src/definitions/<category>.ts`
2. Export from the category file's tools array
3. Import and spread in `packages/tools/src/index.ts`
4. The tool auto-appears in both MCP and chat (per `surfaces` config)

## Workflow System

### Node Registry

All workflow node types are defined in `packages/core/src/workflow-registry.ts`. This is the single source of truth for what nodes exist, their parameters, handles, and categories. Both the UI palette and AI agent consume this registry.

Categories: Triggers, Rules, Conditions, Logic Gates, Actions, Delays, Transforms.

### Operations Engine

Workflow mutations use an operations DSL in `packages/core/src/workflow-operations.ts`:

```typescript
const operations = [
  { op: "add_node", type: "trigger", subtype: "pr_opened" },
  { op: "add_node", type: "rule", subtype: "accountAge", data: { days: 30 } },
  { op: "add_edge", source: "node-1", target: "node-2", sourceHandle: "pass" },
]

const result = applyWorkflowOperations(currentState, operations)
// result: { state, errors[], warnings[] }
```

The AI agent uses the `edit_workflow` tool with this DSL. The engine validates types against the registry, auto-positions nodes, and cascades edge deletions.

### Custom Rules

Custom rules are condition graphs (conditions + logic gates) stored in `custom_rules` table. They use the same operations engine but restricted to `condition`, `logic`, and `transform` node types. Custom rules are a paid feature (free: 2, pro: 10).

## Styling

Use Tailwind only, no inline styles. Use `cn()` from `@tripwire/ui/utils` for conditional classes.

```typescript
<div className={cn("base-classes", isActive && "active-classes")} />
```

Design tokens use `tw-` prefix CSS variables: `text-tw-text-primary`, `bg-tw-surface`, `border-tw-border`, etc.

## Testing

Use Vitest. Test files: `feature.ts` -> `feature.test.ts`. Run with `pnpm test` in the relevant package.

## Commit Messages & Pull Requests

Always include the Median task ID in commit messages and PR titles:

```
git commit -m "MDN-42 fix: resolve auth token expiry"
```

## Median Tasks

Before starting work, check assigned tasks:

```
mdn tasks --agent <your-agent-name>
```

Pick up: `mdn status <TASK-CODE> in_progress --agent <your-agent-name>`
Complete: `mdn status <TASK-CODE> ready --agent <your-agent-name>`
Create: `mdn create --title "Description" --status todo --priority medium --agent <your-agent-name>`

## Learned User Preferences

- Prefer copy edits that preserve the user's original wording and tone rather than rewrites.
- Prefer casual, human-sounding writing; avoid polished AI patterns.
- Avoid em dashes and formulaic contrast phrasing like "it's not X, it's Y."
- When showing tightly related counters in UI, prefer one plain sentence that partitions the numbers once instead of repeating the same figure in multiple ratio fragments.
- For SVG markup that uses fill="currentColor", set visible color via Tailwind text-\* (CSS color).
- Tailwind only emits utilities it can see as literal class substrings at build time; do not rely on template strings that build arbitrary pixel width classes from variables.

## Learned Workspace Facts

- Rules navigation uses path segments (`/{orgHandle}/rules`, `/rules/custom`, …); legacy `?tab=custom` maps to `/rules/custom`. Canonicalizing redirects should use `replace: true` so browser Back is not trapped replaying obsolete query URLs.
- When turning `location.search` into a query string for redirects or links, handle both string and parsed-object shapes—avoid interpolating search into templates when it might stringify as `[object Object]`.
- TanStack Router typed `Link` may reject dynamic paths built as `` `/${orgHandle}/…` `` against generated route unions; use an intermediate variable typed as `string` or typed route IDs with `params` when needed.
- In dev, `[router]` console timings plus `[vite]` logs for slower `/routes/` module responses help separate compile/transform cost from client navigation and render.

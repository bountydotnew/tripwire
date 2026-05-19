# Tripwire CLI plan (`apps/cli`)

Design reference: [mediansh/mono · apps/cli](https://github.com/mediansh/mono/tree/main/apps/cli)
— a `mdn` CLI for the Median task manager. Tripwire's CLI will follow the
same shape: Crust framework, standalone binaries, config in `~/.config/tw`,
API client wraps a thin HTTP layer.

## Binary

`tw` — short, doesn't collide with anything common.

## Commands (initial surface)

Mapped from the existing tool registry (`packages/tools` post-extraction):

```
tw login                          # OAuth or paste-an-API-key flow
tw logout
tw whoami

tw repos                          # list connected repos
tw repos use <repo>               # set default repo for subsequent commands

tw rules                          # show full rule config
tw rules enable <ruleId>
tw rules disable <ruleId>
tw rules action <ruleId> <action> [--threshold N]
tw rules set <ruleId> <field> <value>
tw rules scope set <ruleId> --prs --issues --comments
tw rules scope clear <ruleId>
tw rules content-scope --prs/--issues/--comments
tw rules copy <fromRepo> <toRepo> [--rule <ruleId>]

tw events [--limit N] [--severity ...] [--user @x] [--action ...]
tw event <eventId>

tw user <username>                # lookup_user
tw user <username> score          # score_breakdown
tw user <username> reset [--reason "..."]

tw list                           # list_lists
tw blacklist add <user>
tw blacklist remove <user>
tw whitelist add <user>
tw whitelist remove <user>
tw move <user> --to whitelist|blacklist

tw leaderboard [--limit N]

tw mcp [--port N]                 # boot a local MCP server backed by the
                                   # same tool registry, useful for agent
                                   # workflows that pipe through the CLI
                                   # instead of the hosted app
```

Every command maps 1:1 to a tool in `@tripwire/tools`. The CLI imports the
shared registry and calls handlers directly (when running against a local
DB / dev instance) OR proxies HTTP calls to a deployed Tripwire backend.

## Architecture

```
apps/cli/
├── package.json
├── tsconfig.json
└── src/
    ├── cli.ts                    # entrypoint, registers commands
    ├── commands/
    │   ├── login.ts              # OAuth device flow / paste key
    │   ├── repos.ts
    │   ├── rules.ts              # nested subcommands
    │   ├── events.ts
    │   ├── user.ts               # lookup, score, reset
    │   ├── lists.ts              # blacklist/whitelist/move
    │   ├── leaderboard.ts
    │   └── mcp.ts                # boots local MCP via @tripwire/tools
    ├── lib/
    │   ├── config.ts             # @crustjs/store; ~/.config/tw
    │   ├── client.ts             # HTTP wrapper around the web app's API
    │   ├── format.ts             # table rendering, color, score bars
    │   └── auth.ts               # device-flow / browser hand-off
    └── types.ts
```

## Two run modes

The CLI should support both:

1. **Remote mode** (default for users): authenticated against a deployed
   Tripwire instance. Calls hit `https://<tripwire-url>/api/...`. Uses an
   API token stored in `~/.config/tw/config.json`.

2. **Local mode** (`--local` or autodetected from env): imports
   `@tripwire/tools` directly, hits the local DB. For development and for
   self-hosted users who don't run a web server.

Same command interface; the `lib/client.ts` decides based on config which
backend to call.

## Tech stack

Mirroring the reference:

- **Crust** (`@crustjs/core`, `@crustjs/plugins`, `@crustjs/prompts`,
  `@crustjs/style`, `@crustjs/store`) — opinionated CLI framework.
- **Bun runtime** — `bun run src/cli.ts` in dev; `crust build` packages
  standalone binaries (linux/macos/windows × x64/arm64).
- **No Convex.** Use plain `fetch` against the Tripwire web app, or import
  packages directly in local mode.

If we don't want to commit to Crust, alternatives:

- **clipanion** (Yarn's CLI framework, TS-first, supports SEA builds)
- **commander + prompts + chalk** (boring but reliable)
- **citty** (UnJS, fits with the Nitro/Vite ecosystem already in use)

**Recommendation:** start with Crust to track the reference 1:1, swap later
if friction shows up.

## Auth flow

Two paths, both produce a long-lived API token:

1. **Browser hand-off** (preferred):
   - `tw login` → opens browser to `https://<tripwire>/cli/login?state=...`
   - User signs in via existing GitHub OAuth
   - Browser redirects to `http://localhost:7654/callback?token=...` (a
     temp listener the CLI started)
   - CLI captures the token, writes to `~/.config/tw/config.json`, exits.

2. **Paste key** (fallback / agent-friendly):
   - `tw login --token <KEY>` accepts a token generated in the web settings
     page.

Token format mirrors Median's: `tw_<base64url(baseUrl)>.<secret>`. The
base URL is embedded so users can self-host without an extra flag.

## Output formatting

- Default: pretty tables (via `@crustjs/style` or `cli-table3`).
- `--json` flag on every list command → raw JSON (for AI agents and piping).
- Score breakdown: render the same line-item structure as the chat UI but
  as ASCII with colored deltas.

```
@HanTechnology              Score: 16 / 100

Global reputation                   12 / 40
  Account age 4y 11mo                +8
  Followers 7                        +2
  Non-fork public repos 4            +1
  Authored PRs to this repo (1)      +1

Community signals                    4 / 30
  Achievement: starstruck (tier 1)   +2
  Has bio                            +1

Repo history                         7 / 20
  Baseline                          +10
  1 blocked events (-3 each)         -3

Red flags                           -8 / 0
  Blocked ratio 100%                 -8
```

## Build & distribution

Per the reference:

- `bun run build` — Crust produces raw binaries for 5 targets.
- `bun run package` — stages 5 npm-ready packages in `dist/npm/`.
- `bun run publish` — publishes them in manifest order. Users run
  `npm i -g @tripwire/cli` and the right binary lands on their machine.

For agent / CI usage, also ship a single Bun-runtime build for `npx tw`.

## Phasing

**M0 — Scaffold (1 commit)**

- `apps/cli/package.json`, `tsconfig.json`, `src/cli.ts`
- Crust deps installed
- `tw --version` works
- Turbo recognizes it as an app

**M1 — Read-only commands**

- `tw login` (paste-key path; browser flow comes later)
- `tw repos`
- `tw user <name>`
- `tw events`
- `tw rules` (read)
- Pure HTTP client against deployed Tripwire backend.

**M2 — Mutations**

- `tw blacklist/whitelist/move`
- `tw rules <enable/disable/action/set>`
- `tw user <name> reset`
- `tw rules scope/copy/clear`

**M3 — Local mode**

- Detect `DATABASE_URL` → import `@tripwire/tools` directly
- Same command surface, no network

**M4 — MCP server boot**

- `tw mcp` — starts a stdio MCP server that exposes the same tool registry
- Drops in as an MCP for Claude Code / Cursor without needing the web app

**M5 — Distribution**

- `tw login` browser hand-off
- Standalone binaries on GitHub releases
- npm publish (`@tripwire/cli`)

## Open questions

1. **Crust vs alternatives.** Crust is well-suited but adds a new framework.
   Re-evaluate after M1 if it pays off.
2. **API surface.** Today the web app has tRPC + a few REST endpoints
   (`/api/chat`, `/api/mcp`, `/api/tools/run`). The CLI needs a stable
   HTTP surface — either expose tRPC over fetch, or build a slim
   `/api/cli/*` REST namespace. Lean toward exposing the tool registry
   directly via a single `/api/tools/run` (already exists for the score
   button) gated on `directInvokable` OR a token-scope check.
3. **Token storage.** OS keychain (`keytar`) vs flat-file in `~/.config/tw`.
   Reference uses flat-file; matches expected CLI hygiene.

## Out of scope

- Multi-org switching (defer until orgs land in the web app).
- Interactive TUI dashboards. Plain pretty tables only.
- Plugin system for third-party commands.

## tripwire

Open source moderation for GitHub.

Tripwire watches your repos for low-signal activity (spammy issues, drive-by PRs, suspicious accounts, etc.) and lets you flag, filter, or block it with a configurable rules system. You install it as a GitHub App, point it at your repos, and enable rules.

## What it tracks

**Rules** (block, warn, log, or threshold; scoped to PRs, issues, comments): AI slop, language, min merged PRs, account age, max PRs per day, max files changed, repo activity, profile README, crypto addresses, vouched-only, AI honeypot.

**Lists:** whitelist (bypass) and blacklist (auto-block) per repo.

**Events:** every webhook, rule decision, list change, and config change is logged.

**Contributor score (0–100):**

- Global reputation (40): age, followers, merged PRs, merge ratio, repos, gists
- Community signals (30): GitHub achievements, Sponsors, badges, profile completeness
- Repo history (20): allowed, blocked, near-miss events on your repo
- Red flags (-10): high block ratio, suspicious patterns
- Floor: longevity boosts and overflow bonus for capped categories

**MCP server:** manage rules, lists, events, and users from Claude or any MCP client.

## Setup

Clone:

```bash
git clone https://github.com/bountydotnew/tripwire.git
cd tripwire
pnpm install
```

Copy the example env file and fill it in:

```bash
cp .env.example .env
```

The required vars:

- `BETTER_AUTH_URL` — your local URL, usually `http://localhost:3000`
- `BETTER_AUTH_SECRET` — generate with `openssl rand -hex 32`
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — from your GitHub OAuth App
- `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_WEBHOOK_SECRET` — from your GitHub App
- `VITE_GITHUB_APP_SLUG` — the slug from `github.com/apps/{slug}`
- `DATABASE_URL` — Postgres connection string

GitHub App setup:

- Webhook URL: `{BETTER_AUTH_URL}/api/github/webhook` in production, or your ngrok URL plus `/api/github/webhook` in local dev
- Webhook secret: same value as `GITHUB_WEBHOOK_SECRET`
- Permissions: `Metadata: read`, `Contents: write`, `Issues: write`, `Pull requests: write`
- Subscribe to events: `Installation`, `Installation repositories`, `Issues`, `Issue comment`, `Pull request`, `Push`, `Release`

Optional:

- `UNKEY_ROOT_KEY` — rate limiting (allows all requests if unset)
- `AUTUMN_SECRET_KEY` — billing
- `AXIOM_TOKEN`, `AXIOM_DATASET`, `AXIOM_TRACES_DATASET` — logs and traces
- `OTEL_EXPORTER_OTLP_ENDPOINT` — OpenTelemetry endpoint, defaults to Axiom
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` — durable background jobs (used by the research harness; in dev, run `npx inngest-cli dev` instead)
- `INNGEST_ENV` — required if your Inngest keys belong to a branch environment (otherwise you'll see "400 Branch environment name is required"); leave unset for production
- `RESEARCH_GH_TOKEN` — PAT with `public_repo` scope for the admin research eval harness; lets it read PR data from any public repo without requiring the GH App to be installed

Push tables to db:

```bash
pnpm db:push
```

Start the dev server:

```bash
pnpm dev
```

Open http://localhost:3000.

## Scripts

- `pnpm dev` — run the app
- `pnpm build` — build for production
- `pnpm test` — run tests
- `pnpm typecheck` — typecheck
- `pnpm db:studio` — open Drizzle Studio

## License

MIT.

<!--
## Sponsors
---
<a href="https://www.coderabbit.ai">
  <img src="https://github.com/user-attachments/assets/5bbfd2ad-78fa-4e2e-b9ae-fc0954a5da4b" alt="CodeRabbit" width="200" />
</a>
-->

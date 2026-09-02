> [!WARNING]  
> This repo is not being maintained for the time being. You can find our new live codebase [here](https://github.com/boring-software-inc/v2)


<p align="center">
  <picture>
    <source 
      media="(prefers-color-scheme: dark)" 
      srcset="https://shieldcn.dev/sponsors/ripgrim.svg?preset=transparent&amp;mode=dark&amp;border=false" />
    <img 
      alt="sponsors" 
      src="https://shieldcn.dev/sponsors/ripgrim.svg?preset=transparent&amp;mode=light&amp;border=false" width="1200" />
  </picture>
</p>

<p align="center">
  <img alt="image" src="https://app.tripwire.sh/og.jpg" width="1000" />
</p>

---

<a href="https://github.com/bountydotnew/bounty.new/graphs/contributors">
  <picture>
    <source 
      media="(prefers-color-scheme: dark)" 
      srcset="https://shieldcn.dev/github/bountydotnew/bounty.new/contributors.svg" />
    <img alt="contributors" src="https://shieldcn.dev/github/bountydotnew/bounty.new/contributors.svg?mode=light" />
  </picture>
</a>

Open source moderation for GitHub.

Tripwire watches your repos for low-signal activity (spammy issues, drive-by PRs, suspicious accounts, etc.) and lets you flag, filter, or block it with a configurable rules system. You install it as a GitHub App, point it at your repos, and enable rules.

## Setup

Clone:

```bash
git clone https://github.com/Boring-Software-Inc/tripwire.git
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

<p align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/chart/github/stars/Boring-Software-Inc/tripwire.svg?bg=transparent&amp;title=Tripwire" /><img alt="chart" src="https://shieldcn.dev/chart/github/stars/Boring-Software-Inc/tripwire.svg?mode=light&amp;bg=transparent&amp;title=Tripwire" width="1000" /></picture>
</p>

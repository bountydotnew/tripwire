/** Build org-scoped workspace paths */
export function workspaceRoutes(orgSlug: string) {
  return {
    home: `/${orgSlug}/home`,
    rules: `/${orgSlug}/rules/`,
    customRules: `/${orgSlug}/rules/custom`,
    events: `/${orgSlug}/events`,
    event: (eventId: string) => `/${orgSlug}/events/${eventId}`,
    insights: `/${orgSlug}/insights`,
    automations: `/${orgSlug}/automations`,
    integrations: `/${orgSlug}/integrations`,
  } as const
}

/** Static routes (not org-scoped) */
export const routes = {
  landing: "/",
  login: "/login",
  user: (username: string) => `/users/${username}`,
  vouched: "/vouched",
  request: (owner: string, repo: string) => `/request/${owner}/${repo}`,
  settings: {
    root: "/settings",
    general: "/settings/general",
    account: "/settings/account",
    billing: "/settings/billing",
    developers: "/settings/developers",
  },
  api: {
    githubInstall: "/api/github/install",
    githubCallback: "/api/github/callback",
    githubWebhook: "/api/github/webhook",
  },
} as const

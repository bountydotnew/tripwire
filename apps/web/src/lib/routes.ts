/** Build org-scoped workspace paths */
export function workspaceRoutes(orgSlug: string) {
  return {
    home: `/${orgSlug}/home`,
    rules: `/${orgSlug}/rules/`,
    customRules: `/${orgSlug}/rules/custom`,
    events: `/${orgSlug}/events`,
    event: (eventId: string) => `/${orgSlug}/events/${eventId}`,
    insights: `/${orgSlug}/insights`,
    visibility: `/${orgSlug}/visibility`,
    automations: `/${orgSlug}/automations`,
    integrations: `/${orgSlug}/integrations`,
    search: `/${orgSlug}/search`,
    chat: (chatId: string) => `/${orgSlug}/chat/${chatId}`,
    settings: {
      root: `/${orgSlug}/settings`,
      general: `/${orgSlug}/settings/general`,
      billing: `/${orgSlug}/settings/billing`,
      members: `/${orgSlug}/settings/members`,
    },
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
    account: "/settings/account",
    developers: "/settings/developers",
  },
  api: {
    githubInstall: "/api/github/install",
    githubCallback: "/api/github/callback",
    githubWebhook: "/api/github/webhook",
  },
} as const

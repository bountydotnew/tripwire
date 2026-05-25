import { createTRPCRouter } from "./init"
import { orgsRouter } from "./routers/orgs"
import { rulesRouter } from "./routers/rules"
import { whitelistRouter, blacklistRouter } from "./routers/lists"
import { eventsRouter } from "./routers/events"
import { waitlistRouter } from "./routers/waitlist"
import { chatsRouter } from "./routers/chats"
import { requestsRouter } from "./routers/requests"
import { reputationRouter } from "./routers/reputation"
import { vouchesRouter } from "./routers/vouches"
import { fakeBountiesRouter } from "./routers/fake-bounties"
import { apiKeysRouter } from "./routers/api-keys"
import { preferencesRouter } from "./routers/preferences"
import { workflowsRouter } from "./routers/workflows"
import { customRulesRouter } from "./routers/custom-rules"
import { researchRouter } from "./routers/research"
import { adminReputationRouter } from "./routers/admin-reputation"
import { adminOverviewRouter } from "./routers/admin-overview"
import { visibilityRouter } from "./routers/visibility"
import { onboardingRouter } from "./routers/onboarding"
import { authRouter } from "./routers/auth"
import { githubSignalsRouter } from "./routers/github-signals"

export const trpcRouter = createTRPCRouter({
  orgs: orgsRouter,
  rules: rulesRouter,
  whitelist: whitelistRouter,
  blacklist: blacklistRouter,
  events: eventsRouter,
  waitlist: waitlistRouter,
  chats: chatsRouter,
  requests: requestsRouter,
  reputation: reputationRouter,
  vouches: vouchesRouter,
  fakeBounties: fakeBountiesRouter,
  apiKeys: apiKeysRouter,
  preferences: preferencesRouter,
  workflows: workflowsRouter,
  customRules: customRulesRouter,
  research: researchRouter,
  adminReputation: adminReputationRouter,
  adminOverview: adminOverviewRouter,
  visibility: visibilityRouter,
  onboarding: onboardingRouter,
  auth: authRouter,
  githubSignals: githubSignalsRouter,
})

export type TRPCRouter = typeof trpcRouter

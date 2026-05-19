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
})

export type TRPCRouter = typeof trpcRouter

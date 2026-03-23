import { createTRPCRouter } from "./init";
import { orgsRouter } from "./routers/orgs";
import { rulesRouter } from "./routers/rules";
import { whitelistRouter, blacklistRouter } from "./routers/lists";
import { eventsRouter } from "./routers/events";

export const trpcRouter = createTRPCRouter({
	orgs: orgsRouter,
	rules: rulesRouter,
	whitelist: whitelistRouter,
	blacklist: blacklistRouter,
	events: eventsRouter,
});

export type TRPCRouter = typeof trpcRouter;

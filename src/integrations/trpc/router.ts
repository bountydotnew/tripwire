import { createTRPCRouter } from "./init";
import { orgsRouter } from "./routers/orgs";
import { rulesRouter } from "./routers/rules";
import { whitelistRouter, blacklistRouter } from "./routers/lists";
import { eventsRouter } from "./routers/events";
import { waitlistRouter } from "./routers/waitlist";
import { chatsRouter } from "./routers/chats";

export const trpcRouter = createTRPCRouter({
	orgs: orgsRouter,
	rules: rulesRouter,
	whitelist: whitelistRouter,
	blacklist: blacklistRouter,
	events: eventsRouter,
	waitlist: waitlistRouter,
	chats: chatsRouter,
});

export type TRPCRouter = typeof trpcRouter;

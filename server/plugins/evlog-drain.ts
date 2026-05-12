import { definePlugin as defineNitroPlugin } from "nitro";
import { createAxiomDrain } from "evlog/axiom";

/**
 * Forward wide events to Axiom.
 *
 * Reads `AXIOM_TOKEN` and `AXIOM_DATASET` from the environment. Drain is
 * fire-and-forget; failures are swallowed so they never block the request.
 */
export default defineNitroPlugin((nitroApp) => {
	nitroApp.hooks.hook("evlog:drain", createAxiomDrain());
});

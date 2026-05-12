import { defineConfig } from "nitro";
import evlog from "evlog/nitro/v3";

export default defineConfig({
	experimental: {
		asyncContext: true,
	},
	modules: [
		evlog({
			env: { service: "tripwire" },
			// Mask credit cards, emails, IPs, phone numbers, JWTs, Bearer tokens, IBANs.
			redact: true,
		}),
	],
});

import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "#/db/schema";
import { ruleConfigSchema } from "./config-schema";

describe("ruleConfigSchema", () => {
	it("accepts the current default rule config used by the save flow", () => {
		expect(() => ruleConfigSchema.parse(DEFAULT_RULE_CONFIG)).not.toThrow();
	});

	it("does not require the removed profile picture rule", () => {
		const parsed = ruleConfigSchema.parse({
			...DEFAULT_RULE_CONFIG,
			requireProfilePicture: { enabled: true, action: "block" },
		});

		expect(parsed).not.toHaveProperty("requireProfilePicture");
	});
});

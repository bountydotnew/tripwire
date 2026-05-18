import { describe, expect, it } from "vitest";
import {
	buildListedUserSuggestions,
	getMentionTrigger,
	replaceMentionTrigger,
	type ListedUserSuggestion,
} from "./mentions";

const users: ListedUserSuggestion[] = [
	{ githubUsername: "spammer42", list: "blacklist", avatarUrl: "https://github.com/spammer42.png" },
	{ githubUsername: "torvalds", list: "whitelist", avatarUrl: "https://github.com/torvalds.png" },
	{ githubUsername: "torvalds", list: "whitelist", avatarUrl: "https://github.com/torvalds.png" },
	{ githubUsername: "sindresorhus", list: "whitelist", avatarUrl: "https://github.com/sindresorhus.png" },
];

describe("mention helpers", () => {
	it("detects the active @ query before the cursor", () => {
		expect(getMentionTrigger("check @tor", 10)).toEqual({
			query: "tor",
			start: 6,
			end: 10,
		});
	});

	it("ignores @ characters that are not the active token", () => {
		expect(getMentionTrigger("email test@example.com", 22)).toBeNull();
	});

	it("filters listed users by prefix and de-dupes usernames", () => {
		expect(buildListedUserSuggestions(users, "to")).toEqual([
			{ githubUsername: "torvalds", list: "whitelist", avatarUrl: "https://github.com/torvalds.png" },
		]);
	});

	it("replaces the typed trigger with the selected username", () => {
		const trigger = getMentionTrigger("please check @tor now", 17);
		expect(trigger).not.toBeNull();
		expect(replaceMentionTrigger("please check @tor now", trigger!, "torvalds")).toEqual({
			value: "please check @torvalds now",
			cursorPosition: 22,
		});
	});
});

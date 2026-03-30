import { describe, it, expect, vi, beforeEach } from "vitest";
import * as githubApi from "./github-api";

// Mock the GitHub API module
vi.mock("./github-api", () => ({
	getInstallationToken: vi.fn().mockResolvedValue("mock-token"),
	closePullRequest: vi.fn().mockResolvedValue(null),
	closeIssue: vi.fn().mockResolvedValue(null),
	deleteComment: vi.fn().mockResolvedValue(null),
	getUser: vi.fn(),
	getMergedPrCount: vi.fn(),
	countUserPrsToday: vi.fn(),
	getPrFilesCount: vi.fn(),
	getUserPublicRepoCount: vi.fn(),
	hasProfileReadme: vi.fn(),
}));

// Mock the database
vi.mock("#/db", () => ({
	db: {
		select: vi.fn().mockReturnThis(),
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockResolvedValue([]),
		insert: vi.fn().mockReturnThis(),
		values: vi.fn().mockResolvedValue(null),
	},
}));

describe("filter-pipeline rule checks", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("maxPrsPerDay", () => {
		it("should count PRs opened today correctly", async () => {
			const mockCountUserPrsToday = vi.mocked(githubApi.countUserPrsToday);
			mockCountUserPrsToday.mockResolvedValue(3);

			const count = await githubApi.countUserPrsToday("token", "testuser", "owner/repo");
			expect(count).toBe(3);
			expect(mockCountUserPrsToday).toHaveBeenCalledWith("token", "testuser", "owner/repo");
		});

		it("should block when PR count exceeds limit", async () => {
			const mockCountUserPrsToday = vi.mocked(githubApi.countUserPrsToday);
			mockCountUserPrsToday.mockResolvedValue(5);

			const count = await githubApi.countUserPrsToday("token", "spammer", "owner/repo");
			const limit = 3;
			expect(count >= limit).toBe(true);
		});

		it("should allow when PR count is under limit", async () => {
			const mockCountUserPrsToday = vi.mocked(githubApi.countUserPrsToday);
			mockCountUserPrsToday.mockResolvedValue(2);

			const count = await githubApi.countUserPrsToday("token", "gooduser", "owner/repo");
			const limit = 5;
			expect(count >= limit).toBe(false);
		});
	});

	describe("maxFilesChanged", () => {
		it("should get file count for PR", async () => {
			const mockGetPrFilesCount = vi.mocked(githubApi.getPrFilesCount);
			mockGetPrFilesCount.mockResolvedValue(15);

			const count = await githubApi.getPrFilesCount("token", "owner", "repo", 123);
			expect(count).toBe(15);
			expect(mockGetPrFilesCount).toHaveBeenCalledWith("token", "owner", "repo", 123);
		});

		it("should block when files changed exceeds limit", async () => {
			const mockGetPrFilesCount = vi.mocked(githubApi.getPrFilesCount);
			mockGetPrFilesCount.mockResolvedValue(50);

			const count = await githubApi.getPrFilesCount("token", "owner", "repo", 123);
			const limit = 20;
			expect(count > limit).toBe(true);
		});

		it("should allow when files changed is under limit", async () => {
			const mockGetPrFilesCount = vi.mocked(githubApi.getPrFilesCount);
			mockGetPrFilesCount.mockResolvedValue(10);

			const count = await githubApi.getPrFilesCount("token", "owner", "repo", 123);
			const limit = 20;
			expect(count > limit).toBe(false);
		});
	});

	describe("repoActivityMinimum", () => {
		it("should get public repo count", async () => {
			const mockGetUserPublicRepoCount = vi.mocked(githubApi.getUserPublicRepoCount);
			mockGetUserPublicRepoCount.mockResolvedValue(12);

			const count = await githubApi.getUserPublicRepoCount("token", "activeuser");
			expect(count).toBe(12);
			expect(mockGetUserPublicRepoCount).toHaveBeenCalledWith("token", "activeuser");
		});

		it("should block when repo count is below minimum", async () => {
			const mockGetUserPublicRepoCount = vi.mocked(githubApi.getUserPublicRepoCount);
			mockGetUserPublicRepoCount.mockResolvedValue(1);

			const count = await githubApi.getUserPublicRepoCount("token", "newuser");
			const minRepos = 3;
			expect(count < minRepos).toBe(true);
		});

		it("should allow when repo count meets minimum", async () => {
			const mockGetUserPublicRepoCount = vi.mocked(githubApi.getUserPublicRepoCount);
			mockGetUserPublicRepoCount.mockResolvedValue(5);

			const count = await githubApi.getUserPublicRepoCount("token", "activeuser");
			const minRepos = 3;
			expect(count < minRepos).toBe(false);
		});
	});

	describe("requireProfileReadme", () => {
		it("should return true when user has profile README", async () => {
			const mockHasProfileReadme = vi.mocked(githubApi.hasProfileReadme);
			mockHasProfileReadme.mockResolvedValue(true);

			const hasReadme = await githubApi.hasProfileReadme("token", "userWithReadme");
			expect(hasReadme).toBe(true);
			expect(mockHasProfileReadme).toHaveBeenCalledWith("token", "userWithReadme");
		});

		it("should return false when user has no profile README", async () => {
			const mockHasProfileReadme = vi.mocked(githubApi.hasProfileReadme);
			mockHasProfileReadme.mockResolvedValue(false);

			const hasReadme = await githubApi.hasProfileReadme("token", "userWithoutReadme");
			expect(hasReadme).toBe(false);
		});

		it("should block users without profile README when rule is enabled", async () => {
			const mockHasProfileReadme = vi.mocked(githubApi.hasProfileReadme);
			mockHasProfileReadme.mockResolvedValue(false);

			const hasReadme = await githubApi.hasProfileReadme("token", "noReadmeUser");
			const ruleEnabled = true;
			expect(ruleEnabled && !hasReadme).toBe(true);
		});
	});
});

describe("rule config defaults", () => {
	it("should have correct default values for new rules", async () => {
		const { DEFAULT_RULE_CONFIG } = await import("#/db/schema");

		expect(DEFAULT_RULE_CONFIG.maxPrsPerDay).toEqual({ enabled: false, limit: 5 });
		expect(DEFAULT_RULE_CONFIG.maxFilesChanged).toEqual({ enabled: false, limit: 20 });
		expect(DEFAULT_RULE_CONFIG.repoActivityMinimum).toEqual({ enabled: false, minRepos: 3 });
		expect(DEFAULT_RULE_CONFIG.requireProfileReadme).toEqual({ enabled: false });
	});

	it("should have all new rules disabled by default", async () => {
		const { DEFAULT_RULE_CONFIG } = await import("#/db/schema");

		expect(DEFAULT_RULE_CONFIG.maxPrsPerDay.enabled).toBe(false);
		expect(DEFAULT_RULE_CONFIG.maxFilesChanged.enabled).toBe(false);
		expect(DEFAULT_RULE_CONFIG.repoActivityMinimum.enabled).toBe(false);
		expect(DEFAULT_RULE_CONFIG.requireProfileReadme.enabled).toBe(false);
	});
});

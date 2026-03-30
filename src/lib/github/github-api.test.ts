import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock jose before any imports
vi.mock("jose", () => ({
	SignJWT: vi.fn().mockImplementation(() => ({
		setProtectedHeader: vi.fn().mockReturnThis(),
		setIssuer: vi.fn().mockReturnThis(),
		setIssuedAt: vi.fn().mockReturnThis(),
		setExpirationTime: vi.fn().mockReturnThis(),
		sign: vi.fn().mockResolvedValue("mock-jwt"),
	})),
	importPKCS8: vi.fn().mockResolvedValue("mock-key"),
}));

// Mock crypto
vi.mock("crypto", () => ({
	createPrivateKey: vi.fn().mockReturnValue({
		export: vi.fn().mockReturnValue("mock-pkcs8-key"),
	}),
}));

describe("github-api new functions", () => {
	let originalFetch: typeof global.fetch;

	beforeEach(() => {
		originalFetch = global.fetch;
		vi.clearAllMocks();
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	describe("countUserPrsToday", () => {
		it("should construct correct search query with today's date", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				text: () => Promise.resolve(JSON.stringify({ total_count: 3 })),
			});
			global.fetch = mockFetch;

			const { countUserPrsToday } = await import("./github-api");
			const count = await countUserPrsToday("test-token", "testuser", "owner/repo");

			expect(count).toBe(3);
			expect(mockFetch).toHaveBeenCalledTimes(1);

			const callUrl = mockFetch.mock.calls[0][0] as string;
			expect(callUrl).toContain("/search/issues");
			expect(callUrl).toContain("author:testuser");
			expect(callUrl).toContain("type:pr");
			expect(callUrl).toContain("repo:owner/repo");
			expect(callUrl).toContain("created:>=");
		});

		it("should return 0 when no PRs found", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: () => Promise.resolve(JSON.stringify({ total_count: 0 })),
			});

			const { countUserPrsToday } = await import("./github-api");
			const count = await countUserPrsToday("test-token", "newuser", "owner/repo");

			expect(count).toBe(0);
		});
	});

	describe("getPrFilesCount", () => {
		it("should return changed_files from PR endpoint", async () => {
			const mockFetch = vi.fn()
				.mockResolvedValueOnce({
					ok: true,
					text: () => Promise.resolve(JSON.stringify([])),
				})
				.mockResolvedValueOnce({
					ok: true,
					text: () => Promise.resolve(JSON.stringify({ changed_files: 15 })),
				});
			global.fetch = mockFetch;

			const { getPrFilesCount } = await import("./github-api");
			const count = await getPrFilesCount("test-token", "owner", "repo", 123);

			expect(count).toBe(15);
		});

		it("should handle PRs with many files", async () => {
			const mockFetch = vi.fn()
				.mockResolvedValueOnce({
					ok: true,
					text: () => Promise.resolve(JSON.stringify([])),
				})
				.mockResolvedValueOnce({
					ok: true,
					text: () => Promise.resolve(JSON.stringify({ changed_files: 500 })),
				});
			global.fetch = mockFetch;

			const { getPrFilesCount } = await import("./github-api");
			const count = await getPrFilesCount("test-token", "owner", "repo", 456);

			expect(count).toBe(500);
		});
	});

	describe("getUserPublicRepoCount", () => {
		it("should return public_repos from user endpoint", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: () => Promise.resolve(JSON.stringify({ public_repos: 42 })),
			});

			const { getUserPublicRepoCount } = await import("./github-api");
			const count = await getUserPublicRepoCount("test-token", "activeuser");

			expect(count).toBe(42);
		});

		it("should return 0 for new users", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: () => Promise.resolve(JSON.stringify({ public_repos: 0 })),
			});

			const { getUserPublicRepoCount } = await import("./github-api");
			const count = await getUserPublicRepoCount("test-token", "newuser");

			expect(count).toBe(0);
		});
	});

	describe("hasProfileReadme", () => {
		it("should return true when README exists", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: () => Promise.resolve(JSON.stringify({ name: "README.md" })),
			});

			const { hasProfileReadme } = await import("./github-api");
			const result = await hasProfileReadme("test-token", "userWithReadme");

			expect(result).toBe(true);
		});

		it("should return false when README does not exist (404)", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
				text: () => Promise.resolve("Not Found"),
			});

			const { hasProfileReadme } = await import("./github-api");
			const result = await hasProfileReadme("test-token", "userWithoutReadme");

			expect(result).toBe(false);
		});

		it("should check the correct repo path (username/username)", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				text: () => Promise.resolve(JSON.stringify({ name: "README.md" })),
			});
			global.fetch = mockFetch;

			const { hasProfileReadme } = await import("./github-api");
			await hasProfileReadme("test-token", "octocat");

			const callUrl = mockFetch.mock.calls[0][0] as string;
			expect(callUrl).toContain("/repos/octocat/octocat/readme");
		});
	});
});

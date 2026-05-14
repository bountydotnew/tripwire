import { describe, it, expect } from "vitest";
import {
	detectLanguageScript,
	cleanForLanguageDetection,
} from "./language-detection";

describe("cleanForLanguageDetection", () => {
	it("strips fenced code blocks", () => {
		const input = "Hello world\n```js\nconst x = 1;\n```\nGoodbye";
		expect(cleanForLanguageDetection(input)).not.toContain("const");
	});

	it("strips inline code", () => {
		const input = "Use `fetchData()` to load the items";
		expect(cleanForLanguageDetection(input)).not.toContain("fetchData");
	});

	it("strips URLs", () => {
		const input = "Visit https://example.com/path?q=1 for details";
		expect(cleanForLanguageDetection(input)).not.toContain("https");
	});

	it("strips CamelCase identifiers", () => {
		const input = "The MyComponent renders a UserProfile widget";
		const cleaned = cleanForLanguageDetection(input);
		expect(cleaned).not.toContain("MyComponent");
		expect(cleaned).not.toContain("UserProfile");
		expect(cleaned).toContain("The");
	});

	it("strips snake_case identifiers", () => {
		const input = "Call the get_user_data function for results";
		expect(cleanForLanguageDetection(input)).not.toContain("get_user_data");
	});

	it("strips @mentions and #refs", () => {
		const input = "Thanks @octocat for fixing #123";
		const cleaned = cleanForLanguageDetection(input);
		expect(cleaned).not.toContain("@octocat");
		expect(cleaned).not.toContain("#123");
	});
});

describe("detectLanguageScript", () => {
	it("detects English text as latin/english", () => {
		const result = detectLanguageScript(
			"This is a simple English sentence with common words",
		);
		expect(result.dominant).toBe("english");
		expect(result.confidence).toBeGreaterThan(0.8);
	});

	it("detects Chinese text", () => {
		const result = detectLanguageScript("这是一个中文句子用来测试语言检测功能");
		expect(result.dominant).toBe("chinese");
		expect(result.confidence).toBeGreaterThan(0.9);
	});

	it("detects Korean text", () => {
		const result = detectLanguageScript("이것은 한국어 문장입니다");
		expect(result.dominant).toBe("korean");
		expect(result.confidence).toBeGreaterThan(0.5);
	});

	it("detects Russian/Cyrillic text", () => {
		const result = detectLanguageScript("Это простое предложение на русском языке");
		expect(result.dominant).toBe("russian");
		expect(result.confidence).toBeGreaterThan(0.8);
	});

	it("detects Arabic text", () => {
		const result = detectLanguageScript("هذه جملة بسيطة باللغة العربية");
		expect(result.dominant).toBe("arabic");
		expect(result.confidence).toBeGreaterThan(0.8);
	});

	it("detects Japanese (kana) text", () => {
		const result = detectLanguageScript("これはテストです");
		expect(result.dominant).toBe("japanese");
		expect(result.confidence).toBeGreaterThan(0.5);
	});

	it("returns unknown for empty or numeric-only text", () => {
		expect(detectLanguageScript("").dominant).toBe("unknown");
		expect(detectLanguageScript("12345 67890").dominant).toBe("unknown");
	});

	it("handles mixed Chinese/English, dominant Chinese", () => {
		const result = detectLanguageScript("这个React组件用来展示用户数据的列表");
		expect(result.dominant).toBe("chinese");
	});

	it("handles mixed English with accented characters", () => {
		const result = detectLanguageScript(
			"The café served excellent crème brûlée to the guests",
		);
		expect(result.dominant).toBe("english");
	});

	it("ignores code blocks in detection", () => {
		const input = "这是中文描述\n```js\nconst hello = world;\nconsole.log(test);\n```\n请审查这个更改";
		const result = detectLanguageScript(input);
		expect(result.dominant).toBe("chinese");
	});

	it("ignores URLs in detection", () => {
		const input = "请查看 https://github.com/user/repo 这个仓库的说明文档";
		const result = detectLanguageScript(input);
		expect(result.dominant).toBe("chinese");
	});
});

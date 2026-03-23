/**
 * Verify GitHub webhook signature (SHA-256).
 */
export async function verifyWebhookSignature(
	payload: string,
	signature: string | null,
	secret: string,
): Promise<boolean> {
	if (!signature) return false;

	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
	const digest = `sha256=${Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")}`;

	return signature === digest;
}

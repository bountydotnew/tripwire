import { feature, item, plan } from "atmn";

// ─── Features ───────────────────────────────────────────────

// Tracks AI spend in cents. With 1.25x markup on gpt-4o-mini:

//   Short chat ≈ 1¢, multi-tool investigation ≈ 1-2¢
export const ai_credits = feature({
	id: 'ai_credits',
	name: 'AI Credits',
	type: 'metered',
	consumable: true,
});

// ─── Plans ──────────────────────────────────────────────────

// Free: 100¢ = $1.00 of AI spend/month

// Pro: $9/mo, 2000¢ = $20.00 of AI spend/month
export const free = plan({
	id: 'free',
	name: 'Free',
	autoEnable: true,
	items: [
		item({
			featureId: ai_credits.id,
			included: 100,
			reset: {
				interval: 'month',
			},
		}),
	],
});

export const pro = plan({
	id: 'pro',
	name: 'Pro',
	price: {
		amount: 9,
		interval: 'month',
	},
	items: [
		item({
			featureId: ai_credits.id,
			included: 2000,
			reset: {
				interval: 'month',
			},
		}),
	],
});

export const credit_pack_5 = plan({
	id: 'credit_pack-5',
	name: 'Credit Pack - $5',
	addOn: true,
	items: [
		item({
			featureId: ai_credits.id,
			included: 0,
			price: {
				amount: 5,
				billingUnits: 625,
				billingMethod: 'prepaid',
				interval: 'one_off',
			},
		}),
	],
});

export const credit_pack_25 = plan({
	id: 'credit-pack-25',
	name: 'Credit Pack - $25',
	addOn: true,
	items: [
		item({
			featureId: ai_credits.id,
			included: 0,
			price: {
				amount: 25,
				billingUnits: 3000,
				billingMethod: 'prepaid',
				interval: 'one_off',
			},
		}),
	],
});

export const credit_pack_100 = plan({
	id: 'credit-pack-100',
	name: 'Credit Pack - $100',
	addOn: true,
	items: [
		item({
			featureId: ai_credits.id,
			included: 0,
			price: {
				amount: 100,
				billingUnits: 12500,
				billingMethod: 'prepaid',
				interval: 'one_off',
			},
		}),
	],
});

export const credit_pack_10 = plan({
	id: 'credit-pack-10',
	name: 'Credit Pack - $10',
	addOn: true,
	items: [
		item({
			featureId: ai_credits.id,
			included: 0,
			price: {
				amount: 10,
				billingUnits: 1250,
				billingMethod: 'prepaid',
				interval: 'one_off',
			},
		}),
	],
});

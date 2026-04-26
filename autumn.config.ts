import { feature, item, plan } from "atmn";

// ─── Features ───────────────────────────────────────────────

export const ai_messages = feature({
  id: "ai_messages",
  name: "AI Messages",
  type: "metered",
  consumable: true,
});

// ─── Plans ──────────────────────────────────────────────────

// GPT-4o-mini cost: ~$0.00043/msg
// Free: 50 msgs/mo = $0.02 cost (loss leader)
// Pro: $9/mo, 5000 msgs = $2.15 cost → $6.85 profit (318% margin)

export const free = plan({
  id: "free",
  name: "Free",
  autoEnable: true,
  items: [
    item({
      featureId: ai_messages.id,
      included: 50,
      reset: { interval: "month" },
    }),
  ],
});

export const pro = plan({
  id: "pro",
  name: "Pro",
  price: {
    amount: 9,
    interval: "month",
  },
  items: [
    item({
      featureId: ai_messages.id,
      included: 5000,
      reset: { interval: "month" },
    }),
  ],
});

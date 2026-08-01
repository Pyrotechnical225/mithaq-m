// Membership pricing. Client-safe (no secrets) — edit the amounts here.
export type PlanId = "monthly" | "yearly";

export const PLANS: Record<
  PlanId,
  {
    id: PlanId;
    name: string;
    amount: number; // pence
    currency: "gbp";
    interval: "month" | "year";
    blurb: string;
    highlight?: string;
  }
> = {
  monthly: {
    id: "monthly",
    name: "Monthly",
    amount: 1499,
    currency: "gbp",
    interval: "month",
    blurb: "Full access, cancel any time.",
  },
  yearly: {
    id: "yearly",
    name: "Yearly",
    amount: 9900,
    currency: "gbp",
    interval: "year",
    blurb: "Two months free compared to monthly.",
    highlight: "Best value",
  },
};

export const MEMBERSHIP_BENEFITS = [
  "AI-matched profiles ranked on deen, intentions and life goals",
  "Express interest and reveal contact details on a mutual match",
  "Imam finder with distance in km and a map of the UK",
  "Request an imam-arranged, wali-attended meeting",
  "Privacy controls over every field you share",
] as const;

export const formatPrice = (pence: number) =>
  `£${(pence / 100).toFixed(2).replace(/\.00$/, "")}`;

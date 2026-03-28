export type BillingStatus = "active" | "trialing" | "past_due" | "canceled" | "inactive";

export type BillingPlanKey = "coach_basic" | "coach_premium" | "none" | "TESTEUR";

export type BillingInfo = {
  status: BillingStatus;
  planKey: BillingPlanKey;
  agentsSettingsQty: number;
  agentsVocalQty: number;
  creditsMonthly: number;
  creditsConsumed: number;
  creditsRemaining: number;
  currentPeriodEnd: string | null;
  isTrial: boolean;
};

export type CheckoutSessionResponse = {
  url: string;
};

export type PortalSessionResponse = CheckoutSessionResponse;

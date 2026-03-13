import { useQuery } from "@tanstack/react-query";
import supabase from "../lib/supabase";

type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "inactive";

type PlanKey = "basic" | "ultime" | "custom" | "none" | "TESTEUR";

type Capabilities = {
  maxSettingsAgents: number;
  canUseAssistant: boolean;
  maxChatBotAgent: boolean;
  canBuyExtraCredits: boolean;
};

type SubscriptionState = {
  status: SubscriptionStatus;
  planKey: PlanKey;
  agentsSettingsQty: number;
  creditsMonthly: number;
  creditsBalance: number;
  cycle: "monthly" | "yearly" | null;
  currentPeriodEnd: string | null;
  isTrial: boolean;
  capabilities: Capabilities;
};

const useSubscriptionState = () => {
  return useQuery<SubscriptionState>({
    queryKey: ["subscription", "state"],
    queryFn: async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !sessionData.session) {
        throw new Error("Utilisateur non connecté");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billing-get-information`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${sessionData.session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Erreur API: ${response.status}`);
      }

      const data = (await response.json()) as SubscriptionState;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
};

export default useSubscriptionState;
export type { SubscriptionState, PlanKey };
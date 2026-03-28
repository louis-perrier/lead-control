import { useQuery } from "@tanstack/react-query";
import supabase from "../lib/supabase";
import type { BillingInfo, BillingPlanKey } from "../types/billing";

type PlanKey = BillingPlanKey;

type Capabilities = {
  maxSettingsAgents: number;
  canUseAssistant: boolean;
  maxChatBotAgent: boolean;
  canBuyExtraCredits: boolean;
};

type SubscriptionState = BillingInfo & {
  cycle: "monthly" | "yearly" | null;
  capabilities: Capabilities;
  creditsBalance: number;
};

const DEFAULT_CAPABILITIES: Capabilities = {
  maxSettingsAgents: 0,
  canUseAssistant: false,
  maxChatBotAgent: false,
  canBuyExtraCredits: false,
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

      const rawData = (await response.json()) as BillingInfo & {
        cycle?: SubscriptionState["cycle"];
        capabilities?: Capabilities;
      };

      return {
        ...rawData,
        creditsBalance: rawData.creditsRemaining ?? 0,
        cycle: rawData.cycle ?? null,
        capabilities: rawData.capabilities ?? DEFAULT_CAPABILITIES,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
};

export default useSubscriptionState;
export type { SubscriptionState, PlanKey };
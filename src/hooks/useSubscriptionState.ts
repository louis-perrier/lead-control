import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
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
  const { session } = useAuth();
  return useQuery<SubscriptionState>({
    queryKey: ["subscription", "state"],
    queryFn: async () => {
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error("Utilisateur non connecté");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billing-get-information`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
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
    enabled: Boolean(session?.access_token),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
};

export default useSubscriptionState;
export type { SubscriptionState, PlanKey };
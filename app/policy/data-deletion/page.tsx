import type { Metadata } from "next";
import PolicyDataDeletion from "@/components/marketing/policy/PolicyDataDeletion";

export const metadata: Metadata = {
  title: "Suppression des donnees utilisateurs - LeadControl",
  description:
    "Preconisations LeadControl pour demander la suppression complete ou partielle de vos donnees.",
};

export default function Page() {
  return <PolicyDataDeletion />;
}

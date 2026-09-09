import type { Metadata } from "next";
import Landing from "@/components/marketing/Landing";

export const metadata: Metadata = {
  title: "LeadControl",
  description:
    "LeadControl repond a tes DM Instagram, qualifie les leads et propose un lien Calendly configure en quelques minutes.",
};

export default function Page() {
  return <Landing />;
}

import type { Metadata } from "next";
import PolicyTerms from "@/components/marketing/policy/PolicyTerms";

export const metadata: Metadata = {
  title: "Terms & Conditions - LeadControl",
  description:
    "Conditions generales LeadControl detaillant les droits, obligations, responsabilites et contacts.",
};

export default function Page() {
  return <PolicyTerms />;
}

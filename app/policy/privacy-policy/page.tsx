import type { Metadata } from "next";
import PolicyPrivacy from "@/components/marketing/policy/PolicyPrivacy";

export const metadata: Metadata = {
  title: "Privacy Policy - LeadControl",
  description:
    "Politique de confidentialite LeadControl decrivant les traitements, partages et droits des utilisateurs.",
};

export default function Page() {
  return <PolicyPrivacy />;
}

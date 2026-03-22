import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import CalendlyBadge from "../components/landing/CalendlyBadge";
import HeaderSticky from "../components/landing/HeaderSticky";
import HeroSection from "../components/landing/Sections/HeroSection";
import HowItWorksSection from "../components/landing/Sections/HowItWorksSection";
import CapabilitiesSection from "../components/landing/Sections/CapabilitiesSection";
import ProofSection from "../components/landing/Sections/ProofSection";
import TestimonialsSection from "../components/landing/Sections/TestimonialsSection";
import RoiSection from "../components/landing/Sections/RoiSection";
import PricingSection from "../components/landing/Sections/PricingSection";
import FounderSection from "../components/landing/Sections/FounderSection";
import FinalCtaSection from "../components/landing/Sections/FinalCtaSection";
import FaqSection from "../components/landing/Sections/FaqSection";
import FooterLanding from "../components/landing/Sections/FooterLanding";
import { launchSpotsRemaining, primaryCtaLabel } from "../config/landing";
import styles from "../styles/landing/Landing.module.css";

const Landing = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [spots] = useState(launchSpotsRemaining);

  useEffect(() => {
    if (!loading && user) {
      navigate("/app", { replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    document.body.classList.add("landing-body");
    return () => {
      document.body.classList.remove("landing-body");
    };
  }, []);

  const memoizedTitle = useMemo(() => "LeadControl - Agent IA DM Instagram", []);

  useEffect(() => {
    document.title = memoizedTitle;
  }, [memoizedTitle]);

  return (
    <>
      <HeaderSticky primaryCtaLabel={primaryCtaLabel} />
      <main className={styles.page}>
        <HeroSection primaryCtaLabel={primaryCtaLabel} spotsRemaining={spots} />
        <ProofSection />
        <HowItWorksSection />
        <CapabilitiesSection />
        <TestimonialsSection />
        <RoiSection />
        <PricingSection primaryCtaLabel={primaryCtaLabel} />
        <FounderSection />
        <FaqSection />
        <FinalCtaSection />
        <FooterLanding />
      </main>
      <CalendlyBadge />
    </>
  );
};

export default Landing;

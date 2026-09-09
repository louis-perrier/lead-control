"use client";

import { useEffect, useState } from "react";
import HeaderSticky from "./HeaderSticky";
import HeroSection from "./Sections/HeroSection";
import HowItWorksSection from "./Sections/HowItWorksSection";
import CapabilitiesSection from "./Sections/CapabilitiesSection";
import ProofSection from "./Sections/ProofSection";
import TestimonialsSection from "./Sections/TestimonialsSection";
import VideoTestimonialsSection from "./Sections/VideoTestimonialsSection";
import RoiSection from "./Sections/RoiSection";
import PricingSection from "./Sections/PricingSection";
import GuaranteeSection from "./Sections/GuaranteeSection";
import FounderSection from "./Sections/FounderSection";
import FinalCtaSection from "./Sections/FinalCtaSection";
import FaqSection from "./Sections/FaqSection";
import FooterLanding from "./Sections/FooterLanding";
import { launchSpotsRemaining, primaryCtaLabel } from "@/lib/marketing/landing-config";
import styles from "./Landing.module.css";
import "./landing-global.css";

const Landing = () => {
  const [spots] = useState(launchSpotsRemaining);

  useEffect(() => {
    document.body.classList.add("landing-body");
    return () => {
      document.body.classList.remove("landing-body");
    };
  }, []);

  return (
    <>
      <HeaderSticky primaryCtaLabel={primaryCtaLabel} />
      <main className={styles.page}>
        <HeroSection primaryCtaLabel={primaryCtaLabel} spotsRemaining={spots} />
        <ProofSection />
        <HowItWorksSection />
        <CapabilitiesSection />
        <TestimonialsSection />
        <VideoTestimonialsSection />
        <RoiSection />
        <PricingSection primaryCtaLabel={primaryCtaLabel} />
        <GuaranteeSection />
        <FounderSection />
        <FaqSection />
        <FinalCtaSection />
        <FooterLanding />
      </main>
    </>
  );
};

export default Landing;

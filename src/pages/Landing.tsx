import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import BookCallModal from "../components/landing/BookCallModal";
import HeaderSticky from "../components/landing/HeaderSticky";
import HeroSection from "../components/landing/Sections/HeroSection";
import HowItWorksSection from "../components/landing/Sections/HowItWorksSection";
import CapabilitiesSection from "../components/landing/Sections/CapabilitiesSection";
import ProofSection from "../components/landing/Sections/ProofSection";
import TestimonialsSection from "../components/landing/Sections/TestimonialsSection";
import RoiSection from "../components/landing/Sections/RoiSection";
import PricingSection from "../components/landing/Sections/PricingSection";
import FinalCtaSection from "../components/landing/Sections/FinalCtaSection";
import FaqSection from "../components/landing/Sections/FaqSection";
import FooterLanding from "../components/landing/Sections/FooterLanding";
import { launchSpotsRemaining, primaryCtaLabel } from "../config/landing";
import styles from "../styles/landing/Landing.module.css";

const Landing = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
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

  const handleOpenModal = () => setModalOpen(true);
  const handleCloseModal = () => setModalOpen(false);

  const memoizedTitle = useMemo(() => "LeadControl - Agent IA DM Instagram", []);

  useEffect(() => {
    document.title = memoizedTitle;
  }, [memoizedTitle]);

  return (
    <>
      <HeaderSticky onPrimaryCta={handleOpenModal} primaryCtaLabel={primaryCtaLabel} />
      <main className={styles.page}>
        <HeroSection
          onPrimaryCta={handleOpenModal}
          primaryCtaLabel={primaryCtaLabel}
          spotsRemaining={spots}
        />
        <ProofSection />
        <HowItWorksSection />
        <CapabilitiesSection />
        <TestimonialsSection />
        <RoiSection />
        <PricingSection onPrimaryCta={handleOpenModal} primaryCtaLabel={primaryCtaLabel} />
        <FaqSection />
        <FinalCtaSection onPrimaryCta={handleOpenModal} />
        <FooterLanding />
      </main>
      <BookCallModal open={modalOpen} onClose={handleCloseModal} />
    </>
  );
};

export default Landing;

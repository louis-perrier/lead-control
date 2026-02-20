import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import BookCallModal from "../components/landing/BookCallModal";
import HeaderSticky from "../components/landing/HeaderSticky";
import HeroSection from "../components/landing/Sections/HeroSection";
import HowItWorksSection from "../components/landing/Sections/HowItWorksSection";
import CapabilitiesSection from "../components/landing/Sections/CapabilitiesSection";
import ProofSection from "../components/landing/Sections/ProofSection";
import ReassuranceSection from "../components/landing/Sections/ReassuranceSection";
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
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.visible);
          }
        });
      },
      { threshold: 0.15 },
    );

    const elements = document.querySelectorAll<HTMLElement>("[data-reveal]");
    elements.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleOpenModal = () => setModalOpen(true);
  const handleCloseModal = () => setModalOpen(false);

  const memoizedTitle = useMemo(() => "LeadControl — Agent setter DM Instagram", []);

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
        <HowItWorksSection />
        <CapabilitiesSection />
        <ProofSection />
        <ReassuranceSection />
        <PricingSection onPrimaryCta={handleOpenModal} primaryCtaLabel={primaryCtaLabel} />
        <FinalCtaSection onPrimaryCta={handleOpenModal} />
        <FaqSection />
        <FooterLanding />
      </main>
      <BookCallModal open={modalOpen} onClose={handleCloseModal} />
    </>
  );
};

export default Landing;

import { useEffect } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import AgentAi from "./pages/AgentAi";
import AgentAiConfiguration from "./pages/AgentAiConfiguration";
import Connexion from "./pages/Connexion";
import Crm from "./pages/Crm";
import Demarer from "./pages/Demarer";
import Dashboard from "./pages/Dashboard";
import Feedback from "./components/Feedback";
import Landing from "./pages/Landing";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import PolicyDataDeletion from "./pages/policy/PolicyDataDeletion";
import PolicyPrivacy from "./pages/policy/PolicyPrivacy";
import PolicyTerms from "./pages/policy/PolicyTerms";
import CrmGuard from "./components/GuardComponent/CrmGuard";
import ScrapingGuard from "./components/GuardComponent/ScrapingGuard";
import Subscription from "./pages/Subscription";
import PricingPage from "./pages/PricingPage";

function App() {
  const action = useNavigationType();
  const location = useLocation();
  const pathname = location.pathname;

  useEffect(() => {
    if (action !== "POP") {
      window.scrollTo(0, 0);
    }
  }, [action, pathname]);

  useEffect(() => {
    let title = "";
    let metaDescription = "";

    switch (pathname) {
      case "/":
        title = "LeadControl";
        metaDescription =
          "LeadControl repond a tes DM Instagram, qualifie les leads et propose un lien Calendly configure en quelques minutes.";
        break;
      case "/app":
        title = "LeadControl - Dashboard";
        metaDescription = "Pilote tes agents LeadControl, supervise les conversations et analyse les KPIs.";
        break;
      case "/app/demarer":
        title = "LeadControl - Demarrer";
        metaDescription = "Decouvre LeadControl, son fonctionnement, ses cas d'usage et les fonctionnalites a venir.";
        break;
      case "/app/subscription":
        title = "LeadControl - Abonnement";
        metaDescription = "Gere ton plan LeadControl et decouvre les fonctionnalites disponibles selon ton offre.";
        break;
      case "/app/paiement":
        title = "LeadControl - Pricing";
        metaDescription =
          "Gardez le suivi des plans LeadControl, ajustez les credits et consultez l'historique de facturation.";
        break;
      case "/app/agentai":
        title = "LeadControl - Agents AI";
        metaDescription = "Liste et controle de tes agents, statut des inbox et acces aux overlays.";
        break;
      case "/app/agentai/configuration":
        title = "LeadControl - Configuration d'agent";
        metaDescription = "Parametre les connexions, limites et tests de ton agent LeadControl.";
        break;
      case "/app/scraping":
        title = "LeadControl - Scraping";
        metaDescription = "Orchestration des runs de scraping, collecte des leads et suivi des quotas.";
        break;
      case "/app/crm":
        title = "LeadControl - CRM";
        metaDescription = "Accede au CRM, filtre les conversations et prepare les handoffs.";
        break;
      case "/app/connexion":
        title = "LeadControl - Connexions";
        metaDescription = "Gere tes connexions tierces (Google, LinkedIn, etc.) et recharge les tokens.";
        break;
      case "/policy/data-deletion":
        title = "Suppression des donnees utilisateurs - LeadControl";
        metaDescription =
          "Preconisations LeadControl pour demander la suppression complete ou partielle de vos donnees.";
        break;
      case "/policy/privacy-policy":
        title = "Privacy Policy - LeadControl";
        metaDescription =
          "Politique de confidentialite LeadControl decrivant les traitements, partages et droits des utilisateurs.";
        break;
      case "/policy/terms-et-conditions":
        title = "Terms & Conditions - LeadControl";
        metaDescription =
          "Conditions generales LeadControl detaillant les droits, obligations, responsabilites et contacts.";
        break;
    }

    if (title) {
      document.title = title;
    }

    if (metaDescription) {
      const metaDescriptionTag: HTMLMetaElement | null = document.querySelector(
        'head > meta[name="description"]',
      );
      if (metaDescriptionTag) {
        metaDescriptionTag.content = metaDescription;
      }
    }
  }, [pathname]);

  const showFeedback = pathname.startsWith("/app");

  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/policy/terms-et-conditions" element={<PolicyTerms />} />
        <Route path="/policy/privacy-policy" element={<PolicyPrivacy />} />
        <Route path="/policy/data-deletion" element={<PolicyDataDeletion />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/app/demarer" element={<Demarer />} />
          <Route path="/app" element={<Dashboard />} />
          <Route path="/app/subscription" element={<Subscription />} />
          <Route path="/app/agentai" element={<AgentAi />} />
          <Route
            path="/app/agentai/configuration"
            element={<AgentAiConfiguration />}
          />
          <Route path="/app/crm" element={<CrmGuard />} />
          <Route path="/app/connexion" element={<Connexion />} />
          <Route path="/app/paiement" element={<PricingPage />} />
          <Route path="/app/scraping" element={<ScrapingGuard />} />
          <Route path="/app/*" element={<Navigate to="/app" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showFeedback && <Feedback />}
    </>
  );
}
export default App;

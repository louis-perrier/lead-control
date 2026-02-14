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
import Crm from "./pages/Crm";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Subscription from "./pages/Subscription";
import ProtectedRoute from "./components/ProtectedRoute";
import Connexion from "./pages/Connexion";
import Feedback from "./components/Feedback";
import PolicyDataDeletion from "./pages/policy/PolicyDataDeletion";
import PolicyPrivacy from "./pages/policy/PolicyPrivacy";
import PolicyTerms from "./pages/policy/PolicyTerms";

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
        title = "";
        metaDescription = "";
        break;
      case "/subscription":
        title = "";
        metaDescription = "";
        break;
      case "/agentai":
        title = "";
        metaDescription = "";
        break;
      case "/agentai/configuration":
        title = "";
        metaDescription = "";
        break;
      case "/crm":
        title = "";
        metaDescription = "";
        break;
      case "/connexion":
        title = "";
        metaDescription = "";
        break;
      case "/policy/data-deletion":
        title = "Suppression des données utilisateurs — LeadControl";
        metaDescription =
          "Préconisations LeadControl pour demander la suppression complète ou partielle de vos données.";
        break;
      case "/policy/privacy-policy":
        title = "Privacy Policy — LeadControl";
        metaDescription =
          "Politique de confidentialité LeadControl décrivant les traitements, partages et droits des utilisateurs.";
        break;
      case "/policy/terms-et-conditions":
        title = "Terms & Conditions — LeadControl";
        metaDescription =
          "Conditions générales LeadControl détaillant les droits, obligations, responsabilités et contacts.";
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

  return (
    <>
      <Routes>
        <Route path="/policy/terms-et-conditions" element={<PolicyTerms />} />
        <Route path="/policy/privacy-policy" element={<PolicyPrivacy />} />
        <Route path="/policy/data-deletion" element={<PolicyDataDeletion />} />
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/subscription" element={<Subscription />} />
          <Route path="/agentai" element={<AgentAi />} />
          <Route
            path="/agentai/configuration"
            element={<AgentAiConfiguration />}
          />
          <Route path="/crm" element={<Crm />} />
          <Route path="/connexion" element={<Connexion />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Feedback />
    </>
  );
}
export default App;

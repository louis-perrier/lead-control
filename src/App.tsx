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
    <Routes>
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
export default App;

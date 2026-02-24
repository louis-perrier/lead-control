import { Box, CircularProgress, Typography } from "@mui/material";
import { FunctionComponent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import Scraping from "../../pages/Scraping";
import useScrapingAccess from "../../hooks/useScrapingAccess";

const ScrapingGuard: FunctionComponent = () => {
  const location = useLocation();
  const { hasAccess, isLoading } = useScrapingAccess();

  if (isLoading) {
    return (
      <Box
        component="main"
        sx={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 2,
        }}
      >
        <CircularProgress />
        <Typography>Vérification de l’accès au scraping…</Typography>
      </Box>
    );
  }

  if (!hasAccess) {
    return <Navigate to="/app" replace state={{ from: location.pathname }} />;
  }

  return <Scraping />;
};

export default ScrapingGuard;

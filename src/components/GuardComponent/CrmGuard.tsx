import { Box, CircularProgress, Typography } from "@mui/material";
import { FunctionComponent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import Crm from "../../pages/Crm";
import useCrmAccess from "../../hooks/useCrmAccess";

const CrmGuard: FunctionComponent = () => {
  const location = useLocation();
  const { hasAccess, isLoading } = useCrmAccess();

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
        <Typography>Vérification de l’accès au CRM…</Typography>
      </Box>
    );
  }

  if (!hasAccess) {
    return <Navigate to="/app" replace state={{ from: location.pathname }} />;
  }

  return <Crm />;
};

export default CrmGuard;

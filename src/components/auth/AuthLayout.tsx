import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import { ReactNode } from "react";

const palette = {
  background: "#F6F8FC",
  surface: "#FFFFFF",
  border: "#E6EBF2",
  textPrimary: "#0B1220",
  textSecondary: "#5B667A",
  primary: "#2563EB",
  primaryHover: "#1D4ED8",
  accent: "#22D3EE",
  chipBg: "#EEF2FF",
  chipText: "#3730A3",
};

export const authFieldSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: 3,
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: 1.5,
    "&:hover": {
      borderColor: palette.primary,
    },
    "&.Mui-focused": {
      borderColor: palette.primary,
      boxShadow: `0 0 0 3px rgba(37, 99, 235, 0.15)`,
    },
  },
  "& .MuiInputLabel-root": {
    color: palette.textSecondary,
    fontWeight: 500,
  },
};

export const authActionButtonSx = {
  borderRadius: 99,
  paddingY: 1.2,
  paddingX: 3,
  fontWeight: 600,
  textTransform: "none",
  letterSpacing: 0.2,
  boxShadow: "0 10px 30px rgba(37, 99, 235, 0.25)",
  background: `linear-gradient(135deg, ${palette.primary}, ${palette.primaryHover})`,
};

export const authAlertSx = {
  borderRadius: 2,
  boxShadow: "0 6px 16px rgba(13, 56, 123, 0.12)",
  fontWeight: 500,
};

export const authLinkSx = {
  color: palette.primary,
  fontWeight: 600,
};

export const authCardSx = {
  width: "100%",
  maxWidth: 520,
  borderRadius: 5,
  border: `1px solid ${palette.border}`,
  boxShadow: "0 30px 80px rgba(11, 18, 32, 0.08)",
  backgroundColor: palette.surface,
  position: "relative",
  overflow: "hidden",
};

type AuthLayoutProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  hint?: ReactNode;
};

const AuthLayout = ({ title, subtitle, children, hint }: AuthLayoutProps) => (
  <Box
    component="main"
    sx={{
      minHeight: "100vh",
      backgroundColor: palette.background,
      display: "flex",
      alignItems: "stretch",
      justifyContent: "center",
      position: "relative",
      padding: { xs: 3, md: 6 },
    }}
  >
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(circle at top right, rgba(34, 211, 238, 0.15), transparent 40%), radial-gradient(circle at 20% 20%, rgba(37, 99, 235, 0.08), transparent 45%)",
        pointerEvents: "none",
      }}
    />
    <Stack
      sx={{
        width: "100%",
        maxWidth: 1100,
        mx: "auto",
        alignItems: "center",
        justifyContent: "center",
        mt: { xs: 6, md: 12 },
        mb: { xs: 6, md: 12 },
      }}
      spacing={4}
    >
      <Paper elevation={0} sx={authCardSx}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, rgba(37,99,235,0.04), rgba(34,211,238,0.02))",
            pointerEvents: "none",
          }}
        />
        <Box sx={{ position: "relative", p: { xs: 4, md: 6 } }}>
          <Stack spacing={1.5} mb={3}>
            <Chip
              label="LeadControl Secure"
              sx={{
                alignSelf: "flex-start",
                fontWeight: 600,
                backgroundColor: palette.chipBg,
                color: palette.chipText,
                borderRadius: 2,
                letterSpacing: 0.5,
              }}
            />
            <Typography
              component="h1"
              variant="h4"
              sx={{ color: palette.textPrimary, fontWeight: 700 }}
            >
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body1" color={palette.textSecondary}>
                {subtitle}
              </Typography>
            )}
          </Stack>
          {children}
          {hint && (
            <Box mt={3}>
              {hint}
            </Box>
          )}
        </Box>
      </Paper>
    </Stack>
  </Box>
);

export default AuthLayout;

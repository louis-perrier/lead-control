import {
  Alert,
  Box,
  Button,
  Link,
  Snackbar,
  Stack,
  TextField,
} from "@mui/material";
import { FormEvent, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import supabase from "../lib/supabase";
import {
  getResetPasswordRedirectUrl,
} from "../lib/authRedirects";
import AuthLayout, {
  authActionButtonSx,
  authAlertSx,
  authFieldSx,
  authLinkSx,
} from "../components/auth/AuthLayout";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim()) {
      setError("L’email est requis.");
      return;
    }

    setIsSubmitting(true);

    try {
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getResetPasswordRedirectUrl(),
      });
    } catch (err) {
      console.error("reset password error", err);
    } finally {
      setSuccess(
        "Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.",
      );
      setSnackbarOpen(true);
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Réinitialisation du mot de passe"
      subtitle="Recevoir un lien sécurisé pour mettre à jour ton mot de passe."
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        {error && (
          <Alert severity="error" sx={{ ...authAlertSx }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ ...authAlertSx }}>
            {success}
          </Alert>
        )}
        <TextField
          fullWidth
          required
          name="email"
          type="email"
          label="Adresse e-mail"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isSubmitting}
          sx={authFieldSx}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={isSubmitting}
          sx={{ ...authActionButtonSx }}
        >
          {isSubmitting ? "Envoi en cours..." : "Envoyer le lien"}
        </Button>
        <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
          <Link component={RouterLink} to="/login" sx={authLinkSx} underline="hover">
            Se connecter
          </Link>
          <Link component={RouterLink} to="/signup" sx={authLinkSx} underline="hover">
            Créer un compte
          </Link>
        </Stack>
        <Snackbar
          open={snackbarOpen}
          autoHideDuration={5000}
          onClose={() => setSnackbarOpen(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            onClose={() => setSnackbarOpen(false)}
            severity="info"
            sx={{ width: "100%" }}
          >
            Un mail a été envoyé. Pense à vérifier tes spams.
          </Alert>
        </Snackbar>
      </Box>
    </AuthLayout>
  );
};

export default ForgotPassword;

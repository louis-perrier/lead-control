import {
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Link as RouterLink } from "react-router-dom";
import supabase from "../lib/supabase";
import {
  getLoginRedirectUrl,
} from "../lib/authRedirects";
import AuthLayout, {
  authActionButtonSx,
  authAlertSx,
  authFieldSx,
  authLinkSx,
} from "../components/auth/AuthLayout";

type SignupForm = {
  email: string;
  password: string;
  confirmPassword: string;
};

const initialForm: SignupForm = {
  email: "",
  password: "",
  confirmPassword: "",
};

const normalizeSignupError = (error: Error | null) => {
  if (!error) {
    return "Impossible de créer un compte pour le moment.";
  }

  // En développement, afficher la vraie erreur pour débugger
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.error("Signup error:", error);
    return `Erreur: ${error.message}`;
  }

  const message = error.message.toLowerCase();
  if (message.includes("already registered") || message.includes("duplicate")) {
    return "Impossible de créer un compte avec cette adresse.";
  }

  return "Impossible de créer un compte. Vérifie tes informations.";
};

const Signup = () => {
  const [form, setForm] = useState<SignupForm>(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.email.trim()) {
      setError("L’email est requis.");
      return;
    }

    if (form.password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Les mots de passe doivent correspondre.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          emailRedirectTo: getLoginRedirectUrl(),
        },
      });

      if (error) {
        setError(normalizeSignupError(error));
        return;
      }

      setForm(initialForm);
      setSuccess("Compte créé. Vérifie ton email pour confirmer ton inscription.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Créer un compte LeadControl"
      subtitle="Configure ton cockpit et accède à tes agents IA."
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
          value={form.email}
          onChange={handleChange}
          disabled={isSubmitting}
          sx={authFieldSx}
        />
        <TextField
          fullWidth
          required
          name="password"
          type={showPassword ? "text" : "password"}
          label="Mot de passe"
          value={form.password}
          onChange={handleChange}
          disabled={isSubmitting}
          sx={authFieldSx}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label={
                    showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"
                  }
                  edge="end"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={isSubmitting}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <TextField
          fullWidth
          required
          name="confirmPassword"
          type={showPassword ? "text" : "password"}
          label="Confirmer le mot de passe"
          value={form.confirmPassword}
          onChange={handleChange}
          disabled={isSubmitting}
          sx={authFieldSx}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label={
                    showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"
                  }
                  edge="end"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={isSubmitting}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={isSubmitting}
          sx={{ ...authActionButtonSx }}
        >
          {isSubmitting ? "Création en cours..." : "Créer mon compte"}
        </Button>
        <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
          <Link component={RouterLink} to="/login" sx={authLinkSx} underline="hover">
            Se connecter
          </Link>
          <Link component={RouterLink} to="/forgot-password" sx={authLinkSx} underline="hover">
            Mot de passe oublié ?
          </Link>
        </Stack>
      </Box>
    </AuthLayout>
  );
};

export default Signup;

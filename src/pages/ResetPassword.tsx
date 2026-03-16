import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Link as RouterLink } from "react-router-dom";
import supabase from "../lib/supabase";
import AuthLayout, {
  authActionButtonSx,
  authAlertSx,
  authFieldSx,
  authLinkSx,
} from "../components/auth/AuthLayout";

type ResetForm = {
  password: string;
  confirmPassword: string;
};

const initialForm: ResetForm = {
  password: "",
  confirmPassword: "",
};

const ResetPassword = () => {
  const [form, setForm] = useState<ResetForm>(initialForm);
  const [isPreparing, setIsPreparing] = useState(true);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const hash = window.location.hash.substring(1);
      const urlParams = new URLSearchParams(hash);
      const accessToken = urlParams.get("access_token");
      const refreshToken = urlParams.get("refresh_token");
      const type = urlParams.get("type");

      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        console.log("URL params:", {
          accessToken: accessToken ? "présent" : "manquant",
          refreshToken: refreshToken ? "présent" : "manquant",
          type,
          fullUrl: window.location.href,
        });
      }

      if (!accessToken || !refreshToken || type !== "recovery") {
        if (mounted) {
          setRecoveryError("Ce lien est invalide ou a expiré.");
          setIsPreparing(false);
        }
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (!mounted) {
        return;
      }

      if (error) {
        if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
          console.error("SetSession error:", error);
          setRecoveryError(`Erreur de session: ${error.message}`);
        } else {
          setRecoveryError("Ce lien est invalide ou a expiré.");
        }
      }

      setIsPreparing(false);
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (form.password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Les mots de passe doivent correspondre.");
      return;
    }

    setIsSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password: form.password,
    });

    if (updateError) {
      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        console.error("UpdateUser error:", updateError);
        setError(`Erreur mise à jour: ${updateError.message}`);
      } else {
        setError("Impossible de mettre à jour le mot de passe pour le moment.");
      }
      setIsSubmitting(false);
      return;
    }

    setSuccess("Mot de passe mis à jour.");
    setForm(initialForm);
    setIsSubmitting(false);
  };

  const commonProps = {
    title: "Nouveau mot de passe",
    subtitle: "Réinitialise ton mot de passe LeadControl en toute sécurité.",
  };

  if (isPreparing) {
    return (
      <AuthLayout {...commonProps}>
        <Box
          sx={{
            py: 4,
            display: "flex",
            alignItems: "center",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <CircularProgress />
          <Typography color="text.secondary">Vérification du lien…</Typography>
        </Box>
      </AuthLayout>
    );
  }

  if (recoveryError) {
    return (
      <AuthLayout {...commonProps}>
        <Alert severity="error" sx={{ ...authAlertSx }}>
          {recoveryError}
        </Alert>
        <Stack direction="row" spacing={1} justifyContent="space-between">
          <Link component={RouterLink} to="/login" sx={authLinkSx} underline="hover">
            Se connecter
          </Link>
          <Link component={RouterLink} to="/forgot-password" sx={authLinkSx} underline="hover">
            Générer un nouveau lien
          </Link>
        </Stack>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout {...commonProps}>
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
          name="password"
          type={showPassword ? "text" : "password"}
          label="Nouveau mot de passe"
          value={form.password}
          onChange={handleChange}
          disabled={isSubmitting || Boolean(success)}
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
          disabled={isSubmitting || Boolean(success)}
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
        {!success && (
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
            sx={{ ...authActionButtonSx }}
          >
            {isSubmitting ? "Enregistrement..." : "Mettre à jour"}
          </Button>
        )}
        {success && (
          <Button
            component={RouterLink}
            to="/login"
            variant="contained"
            sx={{ ...authActionButtonSx }}
          >
            Retourner à la connexion
          </Button>
        )}
        <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
          <Link component={RouterLink} to="/login" sx={authLinkSx} underline="hover">
            Se connecter
          </Link>
          <Link component={RouterLink} to="/signup" sx={authLinkSx} underline="hover">
            Créer un compte
          </Link>
        </Stack>
      </Box>
    </AuthLayout>
  );
};

export default ResetPassword;

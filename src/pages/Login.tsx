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
import { FormEvent, useEffect, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import AuthLayout, {
  authActionButtonSx,
  authAlertSx,
  authFieldSx,
  authLinkSx,
} from "../components/auth/AuthLayout";

type LoginForm = {
  email: string;
  password: string;
};

const initialForm: LoginForm = {
  email: "",
  password: "",
};

const Login = () => {
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<LoginForm>(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (user) {
      navigate("/app", { replace: true });
    }
  }, [user, navigate]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await signIn(form);
      navigate("/app", { replace: true });
    } catch (_err) {
      setError("Email ou mot de passe incorrect");
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <>
      <Box
        component={RouterLink}
        to="/"
        sx={{
          position: "fixed",
          top: "1.5rem",
          left: "1.5rem",
          zIndex: 50,
          display: "inline-flex",
          alignItems: "center",
          gap: "0.45rem",
          padding: "0.5rem 1rem 0.5rem 0.75rem",
          borderRadius: "999px",
          border: "1px solid #E6EBF2",
          background: "rgba(255,255,255,0.80)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 4px 20px rgba(11,18,32,0.08)",
          color: "#0B1220",
          textDecoration: "none",
          fontSize: "0.83rem",
          fontWeight: 600,
          letterSpacing: 0.1,
          transition: "transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
          "&:hover": {
            background: "#ffffff",
            boxShadow: "0 6px 24px rgba(11,18,32,0.13)",
            transform: "translateX(-2px)",
          },
        }}
      >
        <ArrowLeft size={15} strokeWidth={2.5} />
        Accueil
      </Box>
      <AuthLayout
      title="Connexion"
      subtitle="Accède à ton cockpit LeadControl en toute sécurité."
      hint={
        <Typography variant="body2" color="text.secondary">
          <Link href="mailto:team@leadcontrol.fr" target="_blank" sx={authLinkSx} underline="hover">
            Besoin d’aide ?
          </Link>{" "}
          Contacte l’équipe LeadControl.
        </Typography>
      }
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
        <Button
          type="submit"
          variant="contained"
          disabled={isSubmitting}
          sx={{ ...authActionButtonSx }}
        >
          {isSubmitting ? "Connexion..." : "Se connecter"}
        </Button>
        <Stack
          direction="row"
          spacing={1}
          justifyContent="space-between"
          alignItems="center"
          sx={{ display: "flex" }}
        >
          <Link component={RouterLink} to="/signup" sx={authLinkSx} underline="hover">
            Créer un compte
          </Link>
          <Link component={RouterLink} to="/forgot-password" sx={authLinkSx} underline="hover">
            Mot de passe oublié ?
          </Link>
        </Stack>
      </Box>
    </AuthLayout>
    </>
  );
};

export default Login;

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
import { Eye, EyeOff } from "lucide-react";
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
    <AuthLayout
      title="Connexion"
      subtitle="Accède à ton cockpit LeadControl en toute sécurité."
      hint={
        <Typography variant="body2" color="text.secondary">
          Besoin d’aide ? Contacte l’équipe LeadControl.
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
          sx={{ display: "none" }}
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
  );
};

export default Login;

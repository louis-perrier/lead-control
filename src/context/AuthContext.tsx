import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import supabase from "../lib/supabase";

type Credentials = {
  email: string;
  password: string;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (credentials: Credentials) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (mounted) {
          setUser(session?.user ?? null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted) {
        const newUser = session?.user ?? null;
        const userChanged = user?.id !== newUser?.id;
        
        setUser(newUser);
        
        // Invalider le cache lors des changements d'utilisateur critiques
        if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && userChanged)) {
          queryClient.invalidateQueries({
            predicate: (query) => {
              // Invalider seulement les queries user-spécifiques
              const key = query.queryKey[0] as string;
              return ['subscription', 'agents', 'clara-conversations', 'signed-audio-url-v2'].includes(key);
            }
          });
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient, user?.id]);

  const signIn = async ({ email, password }: Credentials) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw error;
    }
  };

  const signOut = async () => {
    // Vider immédiatement le cache des données utilisateur avant la déconnexion
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0] as string;
        return ['subscription', 'agents', 'clara-conversations', 'signed-audio-url-v2'].includes(key);
      }
    });
    
    await supabase.auth.signOut();
  };

  const value = useMemo(
    () => ({ user, loading, signIn, signOut }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth doit être utilisé dans AuthProvider.");
  }
  return context;
};

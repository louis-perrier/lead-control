import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";

const useSignedAudioUrl = (mediaPath?: string, messageId?: string, enabled: boolean = false) => {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["signed-audio-url-v2", messageId],
    queryFn: async () => {
      if (!mediaPath || !messageId) {
        throw new Error("Media path and message ID are required");
      }
      
      // Vérifier si c'est déjà une URL complète
      if (mediaPath.startsWith("http")) {
        return mediaPath;
      }
      
      // Récupérer le token de session
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error("Session invalide");
      }
      
      // Extraire le vrai ID du message de l'ID composite
      const realMessageId = messageId.includes('-') ? messageId.split('-')[1] : messageId;
      
      // Appeler l'edge function pour obtenir l'URL signée
      const response = await fetch(
        "https://wxatvxfirhahjalneorq.supabase.co/functions/v1/get-supabase/get-signedUrl",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message_id: realMessageId,
          }),
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `HTTP ${response.status}` };
        }
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.signedUrl) {
        throw new Error("URL signée non générée");
      }
      
      return data.signedUrl;
    },
    enabled: enabled && Boolean(mediaPath && messageId) && Boolean(session?.access_token),
    staleTime: 5 * 60 * 1000, // Cache 5 minutes
    retry: 2, // 2 tentatives en cas d'échec
  });
};

export default useSignedAudioUrl;
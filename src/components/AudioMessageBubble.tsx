import { useEffect, useState } from "react";
import { Badge, Button, Skeleton } from "./ui";
import { ChevronDown, ChevronUp, Loader2, Play, RotateCcw } from "lucide-react";
import useSignedAudioUrl from "../hooks/useSignedAudioUrl";

export type TranscriptStatus = "processing" | "done" | "failed";

type AudioMessageBubbleProps = {
  messageId: string;
  mediaPath: string;
  transcriptStatus: TranscriptStatus;
  transcript?: string | null;
  transcriptError?: string | null;
  isMine: boolean;
  createdAt: string;
};


const formatTimestamp = (iso: string) => {
  const date = new Date(iso);
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const AudioMessageBubble = ({
  messageId,
  mediaPath,
  transcriptStatus,
  transcript,
  transcriptError,
  isMine,
  createdAt,
}: AudioMessageBubbleProps) => {
  // États pour le chargement lazy et les erreurs
  const [hasTriedLoading, setHasTriedLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  
  // États pour la transcription
  const [localTranscriptStatus, setLocalTranscriptStatus] =
    useState<TranscriptStatus>(transcriptStatus);
  const [isRetryingTranscript, setRetryingTranscript] = useState(false);

  // Hook avec chargement lazy
  const {
    data: signedUrl,
    isLoading: urlLoading,
    error: urlError,
    refetch: retryUrl,
  } = useSignedAudioUrl(mediaPath, messageId, hasTriedLoading);

  useEffect(() => {
    setLocalTranscriptStatus(transcriptStatus);
  }, [transcriptStatus]);

  const handleLoadAudio = () => {
    setHasTriedLoading(true);
    setAudioError(null);
  };

  const handleRetryAudio = () => {
    setAudioError(null);
    retryUrl();
  };

  const handleAudioError = () => {
    setAudioError("Impossible de lire ce fichier audio");
  };

  const handleAudioLoadError = () => {
    setAudioError("Fichier audio introuvable ou corrompu");
  };

  const toggleTranscript = () => {
    setShowTranscript(!showTranscript);
  };

  const handleRetryTranscript = async () => {
    setLocalTranscriptStatus("processing");
    setRetryingTranscript(true);
    try {
      await fetch("/api/media/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messageId }),
      });
    } catch (error) {
      setLocalTranscriptStatus("failed");
    } finally {
      setRetryingTranscript(false);
    }
  };

  const timeLabel = formatTimestamp(createdAt);
  const hasTranscript = transcript || localTranscriptStatus === "processing" || localTranscriptStatus === "failed";

  return (
    <div
      className={`flex w-full ${
        isMine ? "justify-end" : "justify-start"
      } px-2`}
    >
      <div
        className={`max-w-[380px] w-full rounded-[16px] border border-[#E6EBF2] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] p-3 ${
          isMine ? "self-end" : "self-start"
        }`}
      >
        <div className="flex justify-between items-center text-xs text-[#5B667A]">
          <Badge variant="default" className="text-xs px-2 py-0.5">Vocal</Badge>
          <span className="text-xs">{timeLabel}</span>
        </div>
        
        <div className="mt-3 space-y-2">
          {!mediaPath ? (
            <div className="flex flex-col items-start gap-2 p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-[12px]">
              <span className="text-sm text-[#DC2626]">Message vocal sans fichier audio</span>
              <span className="text-xs text-[#5B667A]">Le fichier audio n'a pas été enregistré ou est introuvable.</span>
            </div>
          ) : !hasTriedLoading ? (
            <button
              onClick={handleLoadAudio}
              className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#F6F8FC] hover:bg-[#E6EBF2] rounded-[12px] border border-[#E6EBF2] transition-colors text-sm text-[#0B1220] font-medium"
            >
              <Play className="h-4 w-4" />
              Cliquez pour charger l'audio
            </button>
          ) : null}
          
          {hasTriedLoading && urlLoading && (
            <Skeleton height="48px" className="w-full rounded-[12px]" />
          )}
          
          {hasTriedLoading && urlError && (
            <div className="flex flex-col items-start gap-2 p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-[12px]">
              <span className="text-sm text-[#DC2626]">Impossible de charger l'audio</span>
              <Button variant="outline" size="sm" onClick={handleRetryAudio}>
                Réessayer
              </Button>
            </div>
          )}
          
          {hasTriedLoading && signedUrl && !urlError && (
            <>
              <audio 
                controls 
                preload="none" 
                src={signedUrl}
                className="w-full h-10"
                onError={handleAudioError}
                onLoadError={handleAudioLoadError}
              />
              {audioError && (
                <div className="p-2 bg-[#FEF2F2] border border-[#FECACA] rounded-[8px] text-sm text-[#DC2626]">
                  {audioError}
                </div>
              )}
            </>
          )}
        </div>

        {hasTranscript && (
          <div className="mt-3">
            <button
              onClick={toggleTranscript}
              className="flex items-center justify-between w-full py-2 px-3 bg-[#F6F8FC] hover:bg-[#E6EBF2] rounded-[8px] transition-colors text-sm text-[#5B667A] font-medium"
            >
              <span>Transcription</span>
              {showTranscript ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            
            {showTranscript && (
              <div className="mt-2 p-3 rounded-[8px] border border-dashed border-[#E6EBF2] bg-[#F6F8FC] text-sm">
                {localTranscriptStatus === "processing" && (
                  <div className="flex items-center gap-2 text-xs text-[#5B667A]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Transcription en cours…</span>
                  </div>
                )}
                {localTranscriptStatus === "done" && transcript && (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-[#0B1220]">
                    {transcript}
                  </p>
                )}
                {localTranscriptStatus === "done" && !transcript && (
                  <p className="text-xs text-[#5B667A]">Aucune transcription disponible.</p>
                )}
                {localTranscriptStatus === "failed" && (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-[#5B667A]">
                      Transcription impossible
                      {transcriptError ? ` : ${transcriptError}` : "."}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRetryTranscript}
                      disabled={isRetryingTranscript}
                    >
                      {isRetryingTranscript ? (
                        <span className="flex items-center gap-1">
                          <RotateCcw className="h-3 w-3" /> Réessayer…
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <RotateCcw className="h-3 w-3" /> Réessayer
                        </span>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioMessageBubble;
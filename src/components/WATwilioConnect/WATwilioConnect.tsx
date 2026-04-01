import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import supabase from "../../lib/supabase";
import styles from "./WATwilioConnect.module.css";

type FlowState =
  | "selecting"
  | "assigning"
  | "waiting_code"
  | "code_received"
  | "error";

type WATwilioConnectProps = {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  configsId: string;
  onOAuthConnect: () => void;
  onConnected?: () => void;
};

const TIMEOUT_MS = 3 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;
const BASE_URL = import.meta.env.VITE_SUPABASE_URL;
const NOTION_GUIDE_URL =
  "https://lautopreneur.notion.site/Connecter-WhatsApp-LeadControl-331392824e1a812c9657d8d56c77c4e7?source=copy_link";

const WATwilioConnect: React.FC<WATwilioConnectProps> = ({
  isOpen,
  onClose,
  anchorEl,
  configsId,
  onOAuthConnect,
  onConnected,
}) => {
  const [flowState, setFlowState] = useState<FlowState>("selecting");
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(TIMEOUT_MS);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledRef = useRef(false);

  // Recalculate position when opening
  useEffect(() => {
    if (isOpen && anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      setPos({ top: rect.top, left: rect.left });
      setFlowState("selecting");
    }
  }, [isOpen, anchorEl]);

  const clearTimers = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    pollRef.current = null;
    timerRef.current = null;
    timeoutRef.current = null;
  };

  const cleanupRealtime = () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  };

  const handleCodeReceived = (receivedCode: string) => {
    if (handledRef.current) return;
    handledRef.current = true;
    clearTimers();
    cleanupRealtime();
    setCode(receivedCode);
    setFlowState("code_received");
    onConnected?.();
  };

  const startWaiting = async (phoneE164: string, userId: string) => {
    handledRef.current = false;
    setPhone(phoneE164);
    setTimeLeft(TIMEOUT_MS);
    setFlowState("waiting_code");

    const channel = supabase
      .channel(`wa_sms_codes_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "wa_sms_codes",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { code: string; phone_e164: string };
          if (row.phone_e164 === phoneE164 && row.code) {
            handleCodeReceived(row.code);
          }
        }
      )
      .subscribe();
    channelRef.current = channel;

    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("wa_sms_codes")
        .select("code")
        .eq("user_id", userId)
        .eq("phone_e164", phoneE164)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.code) {
        handleCodeReceived(data.code);
      }
    }, POLL_INTERVAL_MS);

    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setTimeLeft(Math.max(0, TIMEOUT_MS - elapsed));
    }, 1000);

    timeoutRef.current = setTimeout(async () => {
      clearTimers();
      cleanupRealtime();
      await callRelease();
      setErrorMessage("Délai dépassé. Aucun code reçu en 3 minutes.");
      setFlowState("error");
    }, TIMEOUT_MS);
  };

  const callAssign = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Session invalide");

    const res = await fetch(`${BASE_URL}/functions/v1/wa-oauth/assign`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ configs_id: configsId }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Erreur ${res.status}: ${text}`);
    }

    const { phone_e164 } = await res.json();
    if (!phone_e164) throw new Error("Numéro non reçu du serveur");
    return { phone_e164, userId: session.user.id };
  };

  const callRelease = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`${BASE_URL}/functions/v1/wa-oauth/release`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ configs_id: configsId }),
      });
    } catch {
      // best effort
    }
  };

  const handleSelectOAuth = () => {
    onClose();
    onOAuthConnect();
  };

  const handleSelectTwilio = async () => {
    setFlowState("assigning");
    setErrorMessage(null);
    try {
      const { phone_e164, userId } = await callAssign();
      await startWaiting(phone_e164, userId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setFlowState("error");
    }
  };

  const handleRetry = async () => {
    clearTimers();
    cleanupRealtime();
    setFlowState("assigning");
    setErrorMessage(null);
    try {
      await callRelease();
      const { phone_e164, userId } = await callAssign();
      await startWaiting(phone_e164, userId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setFlowState("error");
    }
  };

  const handleCopy = () => {
    if (!phone) return;
    navigator.clipboard.writeText(phone).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    return () => {
      clearTimers();
      cleanupRealtime();
    };
  }, []);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div
        className={styles.panel}
        style={{
          top: pos.top,
          left: pos.left,
          transform: "translateY(-100%) translateY(-8px)",
        }}
      >
        {flowState === "selecting" && (
          <>
            <a
              href={NOTION_GUIDE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.guideBanner}
              onClick={(e) => e.stopPropagation()}
            >
              Pas sûr de quelle option choisir ? Consulte le guide →
            </a>
            <div className={styles.optionList}>
              <button className={styles.optionBtn} onClick={handleSelectOAuth}>
                <span className={styles.optionLabel}>Mon numéro WhatsApp actuel</span>
                <span className={styles.optionSub}>Connecter votre propre numéro</span>
              </button>
              <button className={styles.optionBtn} onClick={handleSelectOAuth}>
                <span className={styles.optionLabel}>Un numéro dédié ON/OFF</span>
                <span className={styles.optionSub}>Numéro WhatsApp préparé pour LeadControl</span>
              </button>
              <button className={styles.optionBtn} onClick={handleSelectTwilio}>
                <span className={styles.optionLabel}>Un numéro fourni par LeadControl</span>
                <span className={styles.optionSub}>Numéro attribué automatiquement</span>
              </button>
            </div>
          </>
        )}

        {flowState === "assigning" && (
          <div className={styles.flowRow}>
            <p className={styles.flowTitle}>Attribution d'un numéro…</p>
            <div className={styles.spinner} />
          </div>
        )}

        {flowState === "waiting_code" && (
          <div className={styles.flowRow}>
            <p className={styles.flowTitle}>Envoyez "START" à ce numéro</p>
            <div className={styles.phoneRow}>
              <span className={styles.phone}>{phone}</span>
              <button className={styles.copyBtn} onClick={handleCopy}>
                {copied ? "Copié !" : "Copier"}
              </button>
            </div>
            <p className={styles.waiting}>
              En attente du code SMS…{" "}
              <span className={styles.countdown}>{formatTime(timeLeft)}</span>
            </p>
          </div>
        )}

        {flowState === "code_received" && (
          <div className={styles.flowRow}>
            <p className={styles.flowTitle}>Code reçu</p>
            <p className={styles.flowSub}>Entrez ce code dans WhatsApp pour finaliser.</p>
            <div className={styles.code}>{code}</div>
          </div>
        )}

        {flowState === "error" && (
          <div className={styles.flowRow}>
            <p className={styles.flowTitle}>Erreur</p>
            <p className={styles.errorMsg}>{errorMessage}</p>
            <button className={styles.retryBtn} onClick={handleRetry}>
              Réessayer
            </button>
          </div>
        )}
      </div>
    </>,
    document.body
  );
};

export default WATwilioConnect;

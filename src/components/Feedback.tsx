import {
    FunctionComponent,
    FormEvent,
    useEffect,
    useRef,
    useState,
} from "react";
import styles from "./Feedback.module.css";
import { useAuth } from "../context/AuthContext";

type FeedbackPlacement = "default" | "lifted";

type FeedbackProps = {
    placement?: FeedbackPlacement;
};

const RATING_LABELS = ["", "Médiocre", "Passable", "Bien", "Très bien", "Excellent"];

const StarIcon = ({ filled }: { filled: boolean }) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            fill={filled ? "#f59e0b" : "none"}
            stroke={filled ? "#f59e0b" : "#94a3b8"}
            strokeWidth="1.5"
            strokeLinejoin="round"
        />
    </svg>
);

const Feedback: FunctionComponent<FeedbackProps> = ({ placement = "default" }) => {
    const [showMessage, setShowMessage] = useState(false);
    const [overlayOpen, setOverlayOpen] = useState(false);
    const [message, setMessage] = useState("");
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [error, setError] = useState("");
    const bubbleRef = useRef<HTMLDivElement | null>(null);
    const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        const showTimer = setTimeout(() => setShowMessage(true), 2000);
        const hideTimer = setTimeout(() => setShowMessage(false), 7000);
        return () => {
            clearTimeout(showTimer);
            clearTimeout(hideTimer);
        };
    }, []);

    useEffect(() => {
        return () => {
            if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        };
    }, []);

    const { user } = useAuth();

    const resizeTextarea = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight}px`;
    };

    useEffect(() => {
        if (overlayOpen) resizeTextarea();
    }, [overlayOpen]);

    useEffect(() => {
        if (!overlayOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (bubbleRef.current && !bubbleRef.current.contains(event.target as Node)) {
                setOverlayOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [overlayOpen]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        try {
            const data = await fetch("https://hook.eu2.make.com/nru895kv38y9othihyotugf5wby4jk8k", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: user?.email,
                    message,
                    rating: rating > 0 ? rating : null,
                    key: import.meta.env.VITE_FEEDBACK_KEY,
                }),
            });
            const res = await data.text();
            if (res.trim() === "Reçue") {
                setMessage("");
                setRating(0);
                setHoverRating(0);
                setError("");
                setOverlayOpen(false);
                resizeTextarea();
            } else {
                showError();
            }
        } catch {
            showError();
        }
    };

    const showError = () => {
        setError("Échec de l'envoi, veuillez réessayer");
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        errorTimerRef.current = setTimeout(() => setError(""), 2000);
    };

    const activeRating = hoverRating || rating;

    return (
        <div
            className={[styles.bubble, placement === "lifted" ? styles.bubbleLifted : ""]
                .filter(Boolean)
                .join(" ")}
            ref={bubbleRef}
        >
            {showMessage && <span className={styles.message}>Laissez un feedback</span>}

            <button
                className={styles.button}
                onClick={() => {
                    setOverlayOpen((prev) => !prev);
                    setShowMessage(false);
                }}
                type="button"
            >
                <img className={styles.icon} src="/feedbackChat.svg" alt="Feedback Chat" />
                <span className={styles.buttonLabel}>Feedback</span>
            </button>

            <div
                className={`${styles.overlay} ${overlayOpen ? styles.visible : ""}`}
                role="dialog"
                aria-label="Formulaire de feedback"
            >
                <form className={styles.form} onSubmit={handleSubmit}>
                    <div className={styles.overlayHeader}>
                        <p className={styles.overlayTitle}>Ton feedback</p>
                        <p className={styles.overlayHint}>
                            Ta note et ton message nous aident à améliorer LeadControl.
                        </p>
                    </div>

                    <div className={styles.starsSection}>
                        <p className={styles.starsHeading}>Note ton expérience</p>
                        <div
                            className={styles.starsRow}
                            onMouseLeave={() => setHoverRating(0)}
                        >
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    className={`${styles.starBtn} ${activeRating >= star ? styles.starActive : ""}`}
                                    onClick={() => setRating(rating === star ? 0 : star)}
                                    onMouseEnter={() => setHoverRating(star)}
                                    aria-label={`${star} étoile${star > 1 ? "s" : ""}`}
                                >
                                    <StarIcon filled={activeRating >= star} />
                                </button>
                            ))}
                            <span className={`${styles.starsLabel} ${activeRating > 0 ? styles.starsLabelVisible : ""}`}>
                                {RATING_LABELS[activeRating]}
                            </span>
                        </div>
                    </div>

                    <div className={styles.divider} />

                    <div className={styles.textareaWrapper}>
                        <textarea
                            id="feedbackMessage"
                            className={styles.textarea}
                            value={message}
                            onChange={(event) => {
                                setMessage(event.target.value);
                                resizeTextarea();
                            }}
                            placeholder="Dites-nous tout…"
                            rows={1}
                            ref={textareaRef}
                        />
                        <button
                            className={styles.sendButton}
                            type="submit"
                            aria-label="Envoyer le message"
                        >
                            <img src="/feedbackSend.svg" alt="" className={styles.sendIcon} />
                        </button>
                    </div>
                </form>
            </div>

            {error && <span className={styles.error}>{error}</span>}
        </div>
    );
};

export default Feedback;

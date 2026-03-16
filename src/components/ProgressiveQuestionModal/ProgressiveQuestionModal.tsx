import React, { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import styles from "./ProgressiveQuestionModal.module.css";
import Button from "../Button";
import type {
  CustomToneAnswers,
  CustomToneKey,
  CustomToneQuestion,
} from "../../types/customTone";

type ProgressiveQuestionModalProps = {
  open: boolean;
  questions: CustomToneQuestion[];
  answers: CustomToneAnswers;
  validationErrors: Partial<Record<CustomToneKey, string>>;
  showValidationErrors: boolean;
  touched: Record<CustomToneKey, boolean>;
  onAnswerChange: (key: CustomToneKey, value: string) => void;
  onFieldTouch: (key: CustomToneKey) => void;
  onClose: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
};

const ProgressiveQuestionModal: React.FC<ProgressiveQuestionModalProps> = ({
  open,
  questions,
  answers,
  validationErrors,
  showValidationErrors,
  touched,
  onAnswerChange,
  onFieldTouch,
  onClose,
  onGenerate,
  isGenerating,
}) => {
  // Retour anticipé AVANT tous les hooks pour respecter les Rules of Hooks
  if (!open) return null;

  const [currentIndex, setCurrentIndex] = useState(0);

  // Empêcher le scroll du body quand le modal est ouvert
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const total = questions.length;
  const currentQuestion = questions[currentIndex];
  const currentAnswer = answers[currentQuestion.key] ?? "";
  const hasError = Boolean(validationErrors[currentQuestion.key]);
  const [questionLabel, questionTitle] = currentQuestion.title.includes("—")
    ? currentQuestion.title.split("—").map((segment) => segment.trim())
    : [currentQuestion.title, currentQuestion.title];

  const preview = useMemo(
    () =>
      questions.map((question) => ({
        key: question.key,
        title: question.title,
        snippet: answers[question.key]?.trim().slice(0, 25) + (answers[question.key]?.trim().length > 25 ? "..." : "") ?? "",
        filled: Boolean(answers[question.key]?.trim().length),
      })),
    [answers, questions]
  );

  const invalidCount = useMemo(() => {
    return questions.filter((question) => {
      const length = answers[question.key]?.trim().length ?? 0;
      return length < 200 || length > 900;
    }).length;
  }, [answers, questions]);

  const allQuestionsValid = invalidCount === 0;

  const validationMessage =
    invalidCount > 0
      ? `${invalidCount} réponse${invalidCount > 1 ? "s" : ""} à compléter (minimum 200 caractères)`
      : null;

  const canGoNext = currentIndex < total - 1;
  const canGoPrev = currentIndex > 0;

  const handlePreviewJump = (index: number) => {
    setCurrentIndex(index);
    onFieldTouch(questions[index].key);
  };

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <p className={styles.meta}>Ton personnalisé</p>
            <h3>Analyse de votre style de communication</h3>
            <p className={styles.description}>
              Répondez comme vous le feriez naturellement pour que l’IA reproduise votre ton et votre rythme.
            </p>
          </div>
          <div className={styles.progressIndicator}>
            <span className={styles.progressLabel}>Question</span>
            <span className={styles.progressValue}>{currentIndex + 1}</span>
            <span className={styles.progressSlash}>/</span>
            <span className={styles.progressValue}>{total}</span>
          </div>
        </header>
        <div className={styles.body}>
          <div className={styles.questionArea}>
            <div className={styles.questionHeader}>
              <span className={styles.stepBadge}>{questionLabel}</span>
              <div>
                <p className={styles.questionTitle}>{questionTitle}</p>
                <p className={styles.questionSubtitle}>
                  {currentQuestion.example}
                </p>
              </div>
            </div>
            <p className={styles.instructionText}>
              💡 Répondez comme vous le feriez naturellement à cette situation - cela permet à l'IA d'analyser votre style pour reproduire votre ton.
            </p>
            <textarea
              className={`${styles.textarea} ${
                (hasError && (showValidationErrors || touched[currentQuestion.key]))
                  ? styles.textareaWarning
                  : ""
              }`}
              placeholder="Écrivez ici comment VOUS répondriez naturellement dans cette situation..."
              value={currentAnswer}
              onChange={(event) => {
                onAnswerChange(currentQuestion.key, event.target.value);
                onFieldTouch(currentQuestion.key);
              }}
              rows={5}
            />
            <div className={styles.footerRow}>
              {(showValidationErrors || touched[currentQuestion.key]) && hasError && (
                <p className={styles.error}>{validationErrors[currentQuestion.key]}</p>
              )}
              <span
                className={`${styles.charCountWrap} ${styles.charCount} ${
                  currentAnswer.length > 900
                    ? styles.charCountError
                    : currentAnswer.length < 200 && showValidationErrors
                    ? styles.charCountWarning
                    : ""
                }`}
              >
                {currentAnswer.length} / 900 caractères
                <span className={styles.charCountHint}> · minimum 200</span>
              </span>
            </div>
            <div className={styles.navigationRow}>
              <Button
                variant="secondary"
                className={styles.navButton}
                align="none"
                onClick={() => canGoPrev && setCurrentIndex((prev) => prev - 1)}
                disabled={!canGoPrev}
              >
                Précédent
              </Button>
              <Button
                variant="primary"
                className={styles.navButton}
                align="none"
                onClick={() => canGoNext && setCurrentIndex((prev) => prev + 1)}
                disabled={!canGoNext}
              >
                Suivant
              </Button>
            </div>
          </div>
          <aside className={styles.previewSidebar}>
            <h4>Réponses enregistrées</h4>
            <ul className={styles.previewList}>
              {preview.map((item, index) => {
                const isCurrent = index === currentIndex;
                return (
                  <li
                    key={item.key}
                    className={`${styles.previewItem} ${isCurrent ? styles.previewItemActive : ""} ${
                      item.filled ? styles.previewItemFilled : ""
                    }`}
                  >
                    <button
                      type="button"
                      className={styles.previewItemButton}
                      onClick={() => handlePreviewJump(index)}
                    >
                      <span className={styles.previewIndex}>{index + 1}</span>
                      <div>
                        <p className={styles.previewTitle}>{item.title}</p>
                        <p className={styles.previewSnippet}>
                          {item.snippet || "À compléter"}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
        <footer className={styles.actions}>
          {validationMessage ? (
            <p className={styles.validationHelper}>{validationMessage}</p>
          ) : (
            <div />
          )}
          <div className={styles.actionsRow}>
            <button type="button" className={styles.secondary} onClick={onClose}>
              Fermer
            </button>
            <Button
              disabled={!allQuestionsValid || isGenerating}
              onClick={onGenerate}
              className={styles.primary}
            >
              {isGenerating ? "Analyse de votre style en cours..." : "Analyser mon style"}
            </Button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
};

export default ProgressiveQuestionModal;

import { FunctionComponent, PointerEvent, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./ConfirmationDialog.module.css";
import Button from "./Button";

type ConfirmationDialogProps = {
  open: boolean;
  title?: string;
  message: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
};

const ConfirmationDialog: FunctionComponent<ConfirmationDialogProps> = ({
  open,
  title,
  message,
  onClose,
  onConfirm,
  confirmLabel = "Continuer",
  cancelLabel = "Annuler",
}) => {
  const backdropPointerDownRef = useRef(false);

  if (!open) {
    return null;
  }

  if (typeof document === "undefined") {
    return null;
  }

  const handleBackdropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    backdropPointerDownRef.current = event.target === event.currentTarget;
  };
  const handleBackdropPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const shouldClose =
      backdropPointerDownRef.current && event.target === event.currentTarget;
    backdropPointerDownRef.current = false;
    if (shouldClose) {
      onClose();
    }
  };
  const resetBackdropPointer = () => {
    backdropPointerDownRef.current = false;
  };

  return (
    createPortal(
      <div
        className={styles.backdrop}
        role="presentation"
        onPointerDown={handleBackdropPointerDown}
        onPointerUp={handleBackdropPointerUp}
        onPointerCancel={resetBackdropPointer}
        onPointerLeave={resetBackdropPointer}
      >
        <div
          className={styles.dialog}
          onClick={(event) => event.stopPropagation()}
        >
          {title && <h2 className={styles.title}>{title}</h2>}
          <div className={styles.messageWrapper}>
            <p className={styles.message}>{message}</p>
          </div>
          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={onClose} align="none">
              {cancelLabel}
            </Button>
            <Button type="button" variant="primary" onClick={onConfirm} align="none">
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>,
      document.body
    )
  );
};

export default ConfirmationDialog;

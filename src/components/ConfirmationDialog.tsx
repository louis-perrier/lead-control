import { FunctionComponent } from "react";
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
  if (!open) {
    return null;
  }

  if (typeof document === "undefined") {
    return null;
  }

  return (
    createPortal(
      <div className={styles.backdrop} role="presentation" onClick={onClose}>
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

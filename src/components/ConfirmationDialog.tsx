import { FunctionComponent } from "react";
import styles from "./ConfirmationDialog.module.css";

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
  confirmLabel = "Oui",
  cancelLabel = "Non",
}) => {
  if (!open) {
    return null;
  }

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div className={styles.dialog} onClick={(event) => event.stopPropagation()}>
        {title && <h2 className={styles.title}>{title}</h2>}
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={[styles.button, styles.secondary].join(" ")}
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={[styles.button, styles.primary].join(" ")}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationDialog;

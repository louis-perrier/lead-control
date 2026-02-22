import type { ButtonHTMLAttributes, FC } from "react";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary";
type ButtonAlign = "auto" | "none";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  align?: ButtonAlign;
}

const Button: FC<ButtonProps> = ({
  className = "",
  disabled,
  type = "button",
  variant = "primary",
  align = "auto",
  ...rest
}) => {
  const alignClass = align === "auto" ? styles.alignAuto : "";

  return (
    <button
      type={type}
      className={[
        styles.button,
        styles[variant],
        alignClass,
        disabled ? styles.buttonDisabled : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      {...rest}
    />
  );
};

export default Button;

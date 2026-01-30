import type { ButtonHTMLAttributes, FC } from "react";
import styles from "./Button.module.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

const Button: FC<ButtonProps> = ({
  className = "",
  disabled,
  type = "button",
  ...rest
}) => (
  <button
    type={type}
    className={[
      styles.button,
      disabled ? styles.buttonDisabled : "",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
    disabled={disabled}
    {...rest}
  />
);

export default Button;

import {
  ChangeEvent,
  FC,
  useRef,
  useState,
} from "react";
import styles from "./TextAreaTags.module.css";

type TextAreaProps = {
  label: string;
  placeholder: string;
};

const TextArea: FC<TextAreaProps> = ({ label, placeholder }) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState("");

  const handleInput = () => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
  };

  return (
    <div className={styles.wrapper}>
      <label className={styles.label}>{label}</label>
      <textarea
        className={styles.textarea}
        placeholder={placeholder}
        rows={1}
        ref={textareaRef}
        onInput={handleInput}
        value={text}
        onChange={handleChange}
      />
    </div>
  );
};

export default TextArea;

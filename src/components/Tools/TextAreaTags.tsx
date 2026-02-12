import {
  ChangeEvent,
  FC,
  KeyboardEvent,
  useRef,
  useState,
  useEffect,
} from "react";
import styles from "./TextAreaTags.module.css";

type ConfigTextareaProps = {
  label: string;
  placeholder: string;
  onTagsChange?: (tags: string[]) => void;
  initialTags?: string[];
  required?: boolean;
};

const ConfigTextareaTags: FC<ConfigTextareaProps> = ({
  label,
  placeholder,
  onTagsChange,
  initialTags = [],
  required = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState("");
  const [tags, setTags] = useState<string[]>(initialTags);

  const handleInput = () => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  };

  const updateTags = (nextTags: string[]) => {
    setTags(nextTags);
    if (onTagsChange) {
      onTagsChange(nextTags);
    }
  };

  useEffect(() => {
    setTags(initialTags);
  }, [initialTags]);

  const addTag = (value: string) => {
    updateTags([...tags, value]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const value = text.trim();
      if (!value) return;
      addTag(value);
      setText("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const removeTag = (index: number) => {
    updateTags(tags.filter((_, idx) => idx !== index));
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
  };

  return (
    <div className={styles.wrapper}>
      <label className={styles.label}>
        {label}
        {required && <span className={styles.requiredIndicator}>*</span>}
      </label>
      <div className={styles.tagList}>
        {tags.map((tag, index) => (
          <span key={`${tag}-${index}`} className={styles.tag}>
            {tag}
            <button
              type="button"
              className={styles.tagClose}
              onClick={() => removeTag(index)}
              aria-label={`Supprimer ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <textarea
        className={styles.textarea}
        placeholder={placeholder}
        rows={1}
        ref={textareaRef}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        value={text}
        onChange={handleChange}
      />
    </div>
  );
};

export default ConfigTextareaTags;

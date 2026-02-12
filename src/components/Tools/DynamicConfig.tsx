import {
  ChangeEvent,
  FC,
  KeyboardEvent,
  useRef,
  useState,
  useEffect,
} from "react";
import ConfigTextareaTags from "./TextAreaTags";
import SwitchAnimated from "./SwitchAnimated";
import styles from "./DynamicConfig.module.css";

export type ConfigItem = {
  id: string;
  type: string;
  label: string;
  placeholder?: string;
  enabled?: ConfigItem[];
  required?: boolean;
};

export type ConfigValue = {
  id: string;
  value: unknown;
};

type DynamicConfigProps = {
  items: ConfigItem[];
  initialValues?: ConfigValue[];
  onChange?: (values: ConfigValue[]) => void;
};

const DynamicConfig: FC<DynamicConfigProps> = ({
  items,
  initialValues,
  onChange,
}) => {
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const [text, setText] = useState<Record<string, string>>({});
  const [tags, setTags] = useState<Record<string, string[]>>({});
  const [switchStates, setSwitchStates] = useState<Record<string, boolean>>({});

  const notifyParent = () => {
    if (!onChange) return;
    const values: ConfigValue[] = [];
    Object.entries(text).forEach(([id, value]) => {
      values.push({ id, value });
    });
    Object.entries(tags).forEach(([id, value]) => {
      values.push({ id, value });
    });
    Object.entries(switchStates).forEach(([id, value]) => {
      values.push({ id, value: value ? "on" : "off" });
    });
    onChange(values);
  };

  useEffect(() => {
    notifyParent();
  }, [text, tags, switchStates]);

  useEffect(() => {
    if (!initialValues) return;
    const newText: Record<string, string> = {};
    const newTags: Record<string, string[]> = {};
    const newSwitch: Record<string, boolean> = {};
    initialValues.forEach(({ id, value }: ConfigValue) => {
      if (value === "on" || value === "off") {
        newSwitch[id] = value === "on";
      } else if (typeof value === "string") {
        newText[id] = value;
      } else if (Array.isArray(value)) {
        newTags[id] = value;
      }
    });
    setText(newText);
    setTags(newTags);
    setSwitchStates(newSwitch);
  }, [initialValues]);


  const handleInput = (id: string) => {
    const node = textareaRefs.current[id];
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  };

  const renderItems = (entries: ConfigItem[], path: string = "") =>
    entries.map((item) => {
      const key = `${item.id}`;
      const value = text[key] ?? "";
      switch (item.type) {
        case "configtextareatags":
          return (
            <ConfigTextareaTags
              key={key}
              label={item.label}
              required={item.required}
              placeholder={item.placeholder ?? ""}
              initialTags={tags[key] ?? []}
              onTagsChange={(nextTags) =>
                setTags((prev) => ({ ...prev, [key]: nextTags }))
              }
            />
          );
        case "textarea":
          return renderTextArea(item, key);
        case "switchanimated":
          const checked = switchStates[key] ?? false;
          return (
            <div key={key} className={styles.switchWrapper}>
              <SwitchAnimated
                checked={checked}
                label={item.label}
                onChange={(nextValue) =>
                  setSwitchStates((prev) => ({ ...prev, [key]: nextValue }))
                }
              />
              {checked && item.enabled?.length ? (
                <div className={styles.nested}>
                  {renderItems(item.enabled, key)}
                </div>
              ) : null}
            </div>
          );
        default:
          return null;
      }
    });

  const handleTextChange = (id: string, value: string) => {
    setText((prev) => ({ ...prev, [id]: value }));
  };

  const renderTextArea = (item: ConfigItem, key: string) => (
    <div key={key} className={styles.textareaWrapper}>
      <label className={styles.label}>
        {item.label}
        {item.required && (
          <span className={styles.requiredIndicator}>*</span>
        )}
      </label>
      <textarea
        className={styles.textarea}
        placeholder={item.placeholder ?? ""}
        rows={1}
        ref={(node) => (textareaRefs.current[key] = node)}
        onInput={() => handleInput(key)}
        value={text[key] ?? ""}
        onChange={(event) => handleTextChange(key, event.target.value)}
      />
    </div>
  );

  return <div className={styles.configList}>{renderItems(items)}</div>;
};

export default DynamicConfig;

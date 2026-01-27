import { FunctionComponent } from "react";
import IconButtonStandard from "./IconButtonStandard";
import styles from "./TextField.module.css";

export type TextFieldType = {
  className?: string;
  inputText?: string;
  labelText?: string;
  showSupportingText?: boolean;
  supportingText?: string;
  size?: string;
  type?: string;
  width?: string;

  /** Variant props */
  leadingIcon?: boolean;
  state?: string;
  style?: string;
  textConfigurations?: string;
  trailingIcon?: boolean;
};

const TextField: FunctionComponent<TextFieldType> = ({
  className = "",
  leadingIcon = false,
  state = "Enabled",
  style = "Filled",
  textConfigurations = "Input text",
  trailingIcon = true,
  inputText = "08/17/2025",
  labelText = "Date Début",
  showSupportingText = true,
  supportingText = "MM/DD/YYYY",
  size,
  type,
  width,
}) => {
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/18e984aa-6109-4520-8a57-e7e333c47f2f",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({location:"TextField.tsx:23",message:"TextField props",data:{className,leadingIcon,state,style,textConfigurations,trailingIcon,inputText,labelText,showSupportingText,supportingText,size,type,width},timestamp:Date.now(),sessionId:"debug-session",runId:"post-fix",hypothesisId:"A"})}).catch(()=>{});
  // #endregion
  return (
    <div
      className={[styles.textField, className].join(" ")}
      data-leadingIcon={leadingIcon}
      data-state={state}
      data-style={style}
      data-textConfigurations={textConfigurations}
      data-trailingIcon={trailingIcon}
    >
      <div className={styles.textField2}>
        <div className={styles.stateLayer}>
          <div className={styles.content}>
            <div className={styles.inputTextContainer}>
              <div className={styles.inputText}>{inputText}</div>
            </div>
            <div className={styles.labelTextContainer}>
              <div className={styles.startdate}>{labelText}</div>
            </div>
          </div>
          <IconButtonStandard
            size={size}
            state="Enabled"
            type={type}
            width={width}
          />
        </div>
      </div>
      {!!showSupportingText && (
        <div className={styles.supportingText}>
          <div className={styles.supportingText2}>{supportingText}</div>
        </div>
      )}
    </div>
  );
};

export default TextField;

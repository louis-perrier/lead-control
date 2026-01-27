import { FunctionComponent, type CSSProperties } from "react";
import TextField from "./TextField";
import styles from "./DatePicker.module.css";

export type DatePickerType = {
  className?: string;
  size?: string;
  state?: string;
  type?: string;
  width?: CSSProperties["width"];
};

const DatePicker: FunctionComponent<DatePickerType> = ({
  className = "",
  size,
  state,
  type,
  width,
}) => {
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/18e984aa-6109-4520-8a57-e7e333c47f2f",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({location:"DatePicker.tsx:13",message:"DatePicker props",data:{className,size,state,type,width},timestamp:Date.now(),sessionId:"debug-session",runId:"post-fix",hypothesisId:"A"})}).catch(()=>{});
  // #endregion
  return (
    <div className={[styles.datepicker, className].join(" ")}>
      <TextField
        leadingIcon={false}
        state="Enabled"
        style="Outlined"
        textConfigurations="Input text"
        trailingIcon
        inputText="08/17/2025"
        labelText="Date Début"
        showSupportingText
        supportingText="MM/DD/YYYY"
        size="Small"
        type="Round"
        width="Default"
      />
    </div>
  );
};

export default DatePicker;

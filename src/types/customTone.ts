export type CustomToneKey = "q1" | "q2" | "q3" | "q4" | "q5" | "q6";

export type CustomToneStatus = "idle" | "processing" | "configured" | "failed";

export type CustomToneAnswers = Record<CustomToneKey, string>;

export type CustomToneDefinition = {
  status?: CustomToneStatus;
  answers?: CustomToneAnswers;
  generated_prompt?: string;
  last_generated_at?: string | null;
};

export type CustomToneQuestion = {
  key: CustomToneKey;
  title: string;
  example: string;
};

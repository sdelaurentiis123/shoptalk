export interface GeminiStepOut {
  title: string;
  title_es: string;
  description: string;
  description_es: string;
  startSeconds: number | null;
  endSeconds: number | null;
  substeps: { text: string; text_es: string; timeSeconds: number | null }[];
}

export interface GeminiOut {
  title: string;
  title_es: string;
  description: string;
  description_es: string;
  totalSeconds: number;
  transcript: string;
  transcript_es: string;
  steps: GeminiStepOut[];
}

export interface TranscriptBeat {
  timeSeconds: number;
  text: string;
}

export interface SessionNotes {
  title: string;
  summary: string;
  topics: {
    title: string;
    description: string;
    startSeconds: number;
    endSeconds: number;
  }[];
  keyPoints: {
    text: string;
    timeSeconds: number;
    type: "technique" | "safety" | "quality" | "tool" | "other";
  }[];
  actionItems: { text: string; priority: "high" | "medium" | "low" }[];
}

export type Role = "admin" | "operator";
export type SopType = "video" | "pdf" | "image";
export type SopStatus = "draft" | "active" | "archived";
export type FlagStatus = "open" | "resolved" | "dismissed";
export type MsgRole = "user" | "assistant";
export type LangCode = "en" | "es" | "zh" | "ar";

export interface Facility {
  id: string;
  name: string;
  join_code: string;
  admin_user_id: string;
  default_language: LangCode;
  created_at: string;
  updated_at: string;
}

export interface Station {
  id: string;
  facility_id: string;
  name: string;
  sort_order: number;
}

export interface Sop {
  id: string;
  facility_id: string;
  station_id: string | null;
  title: string;
  description: string;
  title_es: string;
  description_es: string;
  type: SopType;
  status: SopStatus;
  file_path: string | null;
  file_url: string | null;
  total_seconds: number;
  trainer: string;
  recorded_at: string | null;
  transcript: string;
  transcript_es: string;
  created_at: string;
  updated_at: string;
}

export interface Step {
  id: string;
  sop_id: string;
  sort_order: number;
  title: string;
  description: string;
  title_es: string;
  description_es: string;
  start_sec: number | null;
  end_sec: number | null;
}

export interface Substep {
  id: string;
  step_id: string;
  sort_order: number;
  text: string;
  text_es: string;
  time_sec: number | null;
}

export interface StepWithSubsteps extends Step {
  substeps: Substep[];
}

export interface SopWithSteps extends Sop {
  steps: StepWithSubsteps[];
  station?: Station | null;
}

export interface OperatorProfile {
  id: string;
  user_id: string;
  facility_id: string;
  display_name: string;
  language: LangCode;
  last_active_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  facility_id: string;
  station_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MsgRole;
  content: string;
  source_sop_id: string | null;
  source_step: string | null;
  created_at: string;
}

export interface Flag {
  id: string;
  facility_id: string;
  sop_id: string | null;
  user_id: string | null;
  text: string;
  status: FlagStatus;
  created_at: string;
  resolved_at: string | null;
}

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

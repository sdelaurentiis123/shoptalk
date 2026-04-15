import type { LangCode } from "./types";

export const LANGUAGES: { code: LangCode; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "zh", label: "中文" },
  { code: "ar", label: "العربية" },
];

export const LANG_NAME: Record<LangCode, string> = {
  en: "English",
  es: "Spanish",
  zh: "Mandarin Chinese",
  ar: "Arabic",
};

type Dict = Record<string, string>;

const en: Dict = {
  procedures: "Procedures",
  ask: "Ask",
  search: "Search",
  noProcedures: "No procedures found.",
  upload: "Upload procedures",
  uploadHint: "Drop video or PDF files — Gemini will extract steps automatically.",
  chooseFiles: "Choose files",
  analyzingVideo: "Analyzing video with Gemini...",
  analyzingDoc: "Analyzing document with Gemini...",
  generating: "Generating steps...",
  draft: "Draft",
  active: "Active",
  archived: "Archived",
  steps: "steps",
  questions: "questions",
  askPlaceholder: "Ask about any procedure…",
  send: "Send",
  notFound: "I couldn't find that in the procedures. Want to flag this as a documentation gap?",
  reportGap: "Report gap",
  dismiss: "Dismiss",
  source: "Source",
  allStations: "All",
  joinCode: "Join code",
  displayName: "Display name",
  language: "Language",
  join: "Join",
  signIn: "Sign in",
  signUp: "Sign up",
  email: "Email",
  password: "Password",
  facilityName: "Facility name",
  dashboard: "Dashboard",
  settings: "Settings",
  logout: "Log out",
  flags: "Flags",
  resolve: "Resolve",
  loading: "Loading…",
};

const es: Dict = {
  procedures: "Procedimientos",
  ask: "Preguntar",
  search: "Buscar",
  noProcedures: "No se encontraron procedimientos.",
  upload: "Subir procedimientos",
  uploadHint: "Arrastra vídeos o PDF — Gemini extraerá los pasos automáticamente.",
  chooseFiles: "Elegir archivos",
  analyzingVideo: "Analizando vídeo con Gemini...",
  analyzingDoc: "Analizando documento con Gemini...",
  generating: "Generando pasos...",
  draft: "Borrador",
  active: "Activo",
  archived: "Archivado",
  steps: "pasos",
  questions: "preguntas",
  askPlaceholder: "Pregunta sobre cualquier procedimiento…",
  send: "Enviar",
  notFound: "No encontré eso en los procedimientos. ¿Quieres reportarlo como vacío?",
  reportGap: "Reportar vacío",
  dismiss: "Descartar",
  source: "Fuente",
  allStations: "Todas",
  joinCode: "Código de acceso",
  displayName: "Nombre",
  language: "Idioma",
  join: "Entrar",
  signIn: "Iniciar sesión",
  signUp: "Crear cuenta",
  email: "Correo",
  password: "Contraseña",
  facilityName: "Nombre de la instalación",
  dashboard: "Panel",
  settings: "Ajustes",
  logout: "Cerrar sesión",
  flags: "Reportes",
  resolve: "Resolver",
  loading: "Cargando…",
};

const zh: Dict = { ...en };
const ar: Dict = { ...en };

const DICTS: Record<LangCode, Dict> = { en, es, zh, ar };

export function t(lang: LangCode, key: keyof typeof en): string {
  return DICTS[lang]?.[key] ?? en[key] ?? key;
}

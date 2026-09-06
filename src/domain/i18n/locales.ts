export type LocaleCode =
  | "en"
  | "es"
  | "fr"
  | "de"
  | "pt-BR"
  | "ru"
  | "zh-CN"
  | "ja"
  | "hi"
  | "hinglish"
  | "it"
  | "ko"
  | "pl"
  | "tr"
  | "ar";

export type LocaleOption = {
  code: LocaleCode;
  label: string;
};

export const LOCALES: readonly LocaleOption[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "ru", label: "Русский" },
  { code: "zh-CN", label: "中文 (简体)" },
  { code: "ja", label: "日本語" },
  { code: "hi", label: "हिन्दी" },
  { code: "hinglish", label: "Hinglish" },
  { code: "it", label: "Italiano" },
  { code: "ko", label: "한국어" },
  { code: "pl", label: "Polski" },
  { code: "tr", label: "Türkçe" },
  { code: "ar", label: "العربية" },
] as const;

export const LOCALE_STORAGE_KEY = "gta5-door-editor.locale";

export function isLocaleCode(value: string): value is LocaleCode {
  return LOCALES.some((item) => item.code === value);
}

export function resolveInitialLocale(): LocaleCode {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved && isLocaleCode(saved)) return saved;
  } catch {
    /* private mode */
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "en";
  if (isLocaleCode(nav)) return nav;
  const base = nav.split("-")[0] ?? "en";
  if (base === "pt") return "pt-BR";
  if (base === "zh") return "zh-CN";
  if (isLocaleCode(base)) return base;
  return "en";
}

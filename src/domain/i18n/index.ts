import {
  isLocaleCode,
  LOCALE_STORAGE_KEY,
  resolveInitialLocale,
  type LocaleCode,
} from "./locales";
import { en, type MessageKey, type Messages } from "./messages/en";

type Catalog = Partial<Messages> & { __locale: LocaleCode };

const catalogs: Record<LocaleCode, () => Promise<Catalog>> = {
  en: async () => ({ ...en, __locale: "en" }),
  es: async () => ({ ...(await import("./messages/es")).es, __locale: "es" }),
  fr: async () => ({ ...(await import("./messages/fr")).fr, __locale: "fr" }),
  de: async () => ({ ...(await import("./messages/de")).de, __locale: "de" }),
  "pt-BR": async () => ({ ...(await import("./messages/pt-BR")).ptBR, __locale: "pt-BR" }),
  ru: async () => ({ ...(await import("./messages/ru")).ru, __locale: "ru" }),
  "zh-CN": async () => ({ ...(await import("./messages/zh-CN")).zhCN, __locale: "zh-CN" }),
  ja: async () => ({ ...(await import("./messages/ja")).ja, __locale: "ja" }),
  hi: async () => ({ ...(await import("./messages/hi")).hi, __locale: "hi" }),
  hinglish: async () => ({ ...(await import("./messages/hinglish")).hinglish, __locale: "hinglish" }),
  it: async () => ({ ...(await import("./messages/it")).it, __locale: "it" }),
  ko: async () => ({ ...(await import("./messages/ko")).ko, __locale: "ko" }),
  pl: async () => ({ ...(await import("./messages/pl")).pl, __locale: "pl" }),
  tr: async () => ({ ...(await import("./messages/tr")).tr, __locale: "tr" }),
  ar: async () => ({ ...(await import("./messages/ar")).ar, __locale: "ar" }),
};

let locale: LocaleCode = "en";
let table: Partial<Messages> = en;
const listeners = new Set<() => void>();

function applyDocumentLang(code: LocaleCode) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = code;
  document.documentElement.dir = "ltr";
}

function notify() {
  for (const listener of listeners) listener();
}

export function getLocale(): LocaleCode {
  return locale;
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isCorruptMessage(value: string | undefined): boolean {
  if (value == null || value.length === 0) return true;
  if (value.includes("\uFFFD")) return true;
  // CJK packs that lost glyphs often collapse to runs of "?"
  const q = (value.match(/\?/g) ?? []).length;
  return q >= 4 && q / value.length > 0.25;
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const localized = table[key];
  const raw =
    !isCorruptMessage(localized) && localized != null
      ? localized
      : (en[key] ?? String(key));
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`,
  );
}

export async function setLocale(next: LocaleCode): Promise<void> {
  if (!isLocaleCode(next)) return;
  const loaded = await catalogs[next]();
  locale = next;
  table = loaded;
  applyDocumentLang(next);
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    /* private mode */
  }
  notify();
}

export async function initLocale(): Promise<LocaleCode> {
  const initial = resolveInitialLocale();
  await setLocale(initial);
  return initial;
}

export type { MessageKey, LocaleCode };
export { LOCALES } from "./locales";

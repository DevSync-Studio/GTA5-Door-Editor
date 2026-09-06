import { useSyncExternalStore } from "react";
import { getLocale, subscribeLocale, t, type MessageKey } from "@/domain/i18n";

export function useLocale() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  return {
    locale,
    t: (key: MessageKey, vars?: Record<string, string | number>) => t(key, vars),
  };
}

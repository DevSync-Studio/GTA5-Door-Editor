import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LOCALES, setLocale, type LocaleCode } from "@/domain/i18n";
import { useLocale } from "@/hooks/useLocale";
import { cn } from "@/lib/utils";

export function LanguageSelect({ className }: { className?: string }) {
  const { locale, t } = useLocale();
  const current = LOCALES.find((item) => item.code === locale)?.label ?? locale;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="px-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
        {t("lang.select")}
      </span>
      <Select
        value={locale}
        onValueChange={(value) => {
          void setLocale(value as LocaleCode);
        }}
      >
        <SelectTrigger
          size="sm"
          aria-label={t("app.languageAria")}
          className={cn(
            "h-8 w-full min-w-0 justify-between gap-2 rounded-md border-line-soft bg-panel/60 px-2.5",
            "text-[12px] font-medium text-bright shadow-none",
            "hover:border-primary/35 hover:bg-panel/80",
            "focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/30",
            "dark:bg-panel/60 dark:hover:bg-panel/80",
            "[&_svg]:size-3.5 [&_svg]:translate-y-0 [&_svg]:text-faint",
          )}
        >
          <SelectValue placeholder={current} />
        </SelectTrigger>
        <SelectContent
          position="popper"
          side="top"
          align="start"
          sideOffset={6}
          className="max-h-64 w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)] rounded-md border border-line-soft bg-panel-elevated p-1 shadow-[0_8px_28px_rgba(0,0,0,0.45)]"
        >
          {LOCALES.map((item) => (
            <SelectItem
              key={item.code}
              value={item.code}
              className="rounded-sm py-1.5 pr-8 pl-2 text-[12px] text-bright focus:bg-primary/15 focus:text-bright"
            >
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

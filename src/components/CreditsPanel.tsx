import { useState } from "react";
import { ExternalLink, Heart, X } from "lucide-react";
import type { MessageKey } from "@/domain/i18n";
import { useLocale } from "@/hooks/useLocale";
import { openExternalUrl } from "@/lib/files";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type CreditEntry = {
  name: string;
  handle: string;
  avatar: string;
  messageKey: MessageKey;
  profileUrl: string;
  url?: string;
  urlLabel?: string;
};

const CREDITS: CreditEntry[] = [
  {
    name: "SubhamGG",
    handle: "subhamgg",
    avatar: "https://github.com/subhamgg.png?size=96",
    messageKey: "credits.subhamgg.message",
    profileUrl: "https://github.com/subhamgg",
  },
  {
    name: "tiwabs",
    handle: "tiwabs",
    avatar: "https://github.com/tiwabs.png?size=96",
    messageKey: "credits.tiwabs.message",
    profileUrl: "https://github.com/tiwabs",
    url: "https://github.com/tiwabs/twAudioDoorTool",
    urlLabel: "tiwabs/twAudioDoorTool",
  },
  {
    name: "Hedgehog Technologies",
    handle: "Hedgehog-Technologies",
    avatar: "https://github.com/Hedgehog-Technologies.png?size=96",
    messageKey: "credits.hedgehog.message",
    profileUrl: "https://github.com/Hedgehog-Technologies",
    url: "https://github.com/Hedgehog-Technologies/doortuning-example",
    urlLabel: "Hedgehog-Technologies/doortuning-example",
  },
  {
    name: "dexyfex / CodeWalker",
    handle: "dexyfex",
    avatar: "https://github.com/dexyfex.png?size=96",
    messageKey: "credits.codewalker.message",
    profileUrl: "https://github.com/dexyfex",
    url: "https://github.com/dexyfex/CodeWalker",
    urlLabel: "dexyfex/CodeWalker",
  },
];

function CreditCard({ entry }: { entry: CreditEntry }) {
  const { t } = useLocale();

  const openUrl = async (url: string) => {
    try {
      await openExternalUrl(url);
    } catch (error) {
      toast(error instanceof Error ? error.message : t("credits.toast.openFailed"), true);
    }
  };

  return (
    <div className="border-b border-line-soft px-3 py-2.5 last:border-b-0">
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          title={t("credits.openOnGitHub", { name: entry.name })}
          onClick={() => void openUrl(entry.profileUrl)}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 outline-none transition-opacity hover:opacity-90 focus-visible:ring-1 focus-visible:ring-primary/40"
        >
          <img
            src={entry.avatar}
            alt=""
            width={36}
            height={36}
            loading="lazy"
            className="block size-9 rounded-full border border-line-soft bg-panel-2 object-cover"
          />
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            title={t("credits.openOnGitHub", { name: entry.name })}
            onClick={() => void openUrl(entry.profileUrl)}
            className="m-0 block max-w-full truncate text-left text-[12.5px] font-medium leading-5 text-bright transition-colors hover:text-blue"
          >
            {entry.name}
          </button>
          <p className="m-0 mt-0.5 text-[12px] leading-5 text-muted-foreground">
            {t(entry.messageKey)}
          </p>
          {entry.url && entry.urlLabel ? (
            <button
              type="button"
              title={t("credits.openLink", { label: entry.urlLabel })}
              onClick={() => void openUrl(entry.url!)}
              className="mt-1.5 inline-flex max-w-full items-center gap-1 truncate text-[11px] text-blue transition-colors hover:text-bright"
            >
              <ExternalLink className="size-3 shrink-0" strokeWidth={1.75} />
              <span className="truncate font-mono">{entry.urlLabel}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CreditsPanel() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        title={open ? t("credits.hide") : t("credits.show")}
        aria-label={t("credits.aria")}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "relative inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors",
          "hover:bg-primary/10 hover:text-bright",
          open && "bg-primary/10 text-bright",
        )}
      >
        <Heart className="size-3.5" strokeWidth={1.75} />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label={t("credits.closeAria")}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 bottom-[calc(100%+8px)] z-50 flex w-[360px] max-w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden rounded-md border border-line-soft bg-panel-elevated shadow-[0_8px_28px_rgba(0,0,0,0.45)]">
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-line-soft px-3">
              <span className="text-[12px] font-medium text-bright">{t("credits.title")}</span>
              <button
                type="button"
                title={t("credits.hideTitle")}
                aria-label={t("credits.hideAria")}
                onClick={() => setOpen(false)}
                className="inline-flex size-6 items-center justify-center rounded text-faint transition-colors hover:bg-hover hover:text-bright"
              >
                <X className="size-3.5" strokeWidth={1.75} />
              </button>
            </div>

            <div className="max-h-[min(420px,50vh)] overflow-y-auto">
              {CREDITS.map((entry) => (
                <CreditCard key={entry.handle} entry={entry} />
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

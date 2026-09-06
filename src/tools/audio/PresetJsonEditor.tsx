import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AlignLeft, ArrowLeft, Check, ListRestart, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/Dialogs";
import {
  catalogJson,
  DEFAULT_AUDIO,
  parseAudioCatalog,
  validateAudioCatalog,
  type AudioPreset,
} from "@/domain/audio";
import { useLocale } from "@/hooks/useLocale";
import { cn } from "@/lib/utils";

const VS = {
  key: "#9cdcfe",
  string: "#ce9178",
  number: "#b5cea8",
  keyword: "#569cd6",
  punct: "#d4d4d4",
} as const;

function countLines(value: string): number {
  if (!value) return 1;
  let n = 1;
  for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) === 10) n++;
  return n;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightJson(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;

  const peekNonSpace = (from: number) => {
    let j = from;
    while (j < n && (source[j] === " " || source[j] === "\t" || source[j] === "\r" || source[j] === "\n")) {
      j++;
    }
    return source[j];
  };

  while (i < n) {
    const ch = source[i]!;

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let escaped = false;
      while (j < n) {
        const c = source[j]!;
        if (escaped) {
          escaped = false;
          j++;
          continue;
        }
        if (c === "\\") {
          escaped = true;
          j++;
          continue;
        }
        if (c === quote) {
          j++;
          break;
        }
        j++;
      }
      const lexeme = source.slice(i, j);
      const color = peekNonSpace(j) === ":" ? VS.key : VS.string;
      out += `<span style="color:${color}">${escapeHtml(lexeme)}</span>`;
      i = j;
      continue;
    }

    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let j = i + 1;
      while (j < n) {
        const c = source[j]!;
        if ((c >= "0" && c <= "9") || c === "." || c === "e" || c === "E" || c === "+" || c === "-") {
          j++;
          continue;
        }
        break;
      }
      const lexeme = source.slice(i, j);
      if (lexeme !== "-" && /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(lexeme)) {
        out += `<span style="color:${VS.number}">${escapeHtml(lexeme)}</span>`;
        i = j;
        continue;
      }
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[a-zA-Z0-9_]/.test(source[j]!)) j++;
      const lexeme = source.slice(i, j);
      const color =
        lexeme === "true" || lexeme === "false" || lexeme === "null" ? VS.keyword : VS.punct;
      out += `<span style="color:${color}">${escapeHtml(lexeme)}</span>`;
      i = j;
      continue;
    }

    if (ch === "{" || ch === "}" || ch === "[" || ch === "]" || ch === ":" || ch === ",") {
      out += `<span style="color:${VS.punct}">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }

    let j = i + 1;
    while (j < n) {
      const c = source[j]!;
      if (
        c === '"' ||
        c === "'" ||
        c === "{" ||
        c === "}" ||
        c === "[" ||
        c === "]" ||
        c === ":" ||
        c === "," ||
        c === "-" ||
        (c >= "0" && c <= "9") ||
        /[a-zA-Z_]/.test(c)
      ) {
        break;
      }
      j++;
    }
    out += escapeHtml(source.slice(i, j));
    i = j;
  }

  return out;
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function tryParseCatalog(
  text: string,
  invalidJson: string,
): { ok: true; count: number } | { ok: false; error: string } {
  try {
    const next = parseAudioCatalog(text);
    validateAudioCatalog(next);
    return { ok: true, count: next.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : invalidJson };
  }
}

export function PresetJsonEditor({
  catalog,
  onBack,
  onApply,
}: {
  catalog: AudioPreset[];
  onBack: () => void;
  onApply: (catalog: AudioPreset[]) => void;
}) {
  const { t } = useLocale();
  const baseline = useMemo(() => ensureTrailingNewline(catalogJson(catalog)), [catalog]);
  const defaultsText = useMemo(() => ensureTrailingNewline(catalogJson(DEFAULT_AUDIO)), []);
  const [text, setText] = useState(baseline);
  const [error, setError] = useState<string | null>(null);
  const [confirmBack, setConfirmBack] = useState(false);
  const guttersRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const setEditorText = (next: string) => {
    setText(ensureTrailingNewline(next));
  };

  useEffect(() => {
    setText(baseline);
    setError(null);
  }, [baseline]);

  useEffect(() => {
    areaRef.current?.focus();
  }, []);

  const dirty = text !== baseline;
  const lineCount = countLines(text);
  const live = useMemo(() => tryParseCatalog(text, t("preset.invalidJson")), [text, t]);
  const lines = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => String(i + 1)),
    [lineCount],
  );
  const highlighted = useMemo(() => highlightJson(text), [text]);

  const syncScroll = () => {
    const area = areaRef.current;
    if (!area) return;
    if (guttersRef.current) guttersRef.current.scrollTop = area.scrollTop;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = area.scrollTop;
      highlightRef.current.scrollLeft = area.scrollLeft;
    }
  };

  const formatJson = () => {
    try {
      const parsed = JSON.parse(text) as unknown;
      setEditorText(`${JSON.stringify(parsed, null, 2)}\n`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("preset.cannotFormat"));
    }
  };

  const apply = () => {
    const result = tryParseCatalog(text, t("preset.invalidJson"));
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onApply(parseAudioCatalog(text));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const el = event.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = `${text.slice(0, start)}  ${text.slice(end)}`;
      setText(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      apply();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      apply();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line-soft px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-muted-foreground"
            onClick={() => {
              if (dirty) {
                setConfirmBack(true);
                return;
              }
              onBack();
            }}
          >
            <ArrowLeft className="size-3.5" strokeWidth={1.75} />
            {t("preset.back")}
          </Button>
          <span className="text-line-soft">/</span>
          <span className="truncate font-mono text-[12px] text-bright">door-audio-settings.json</span>
          {dirty ? (
            <span className="shrink-0 rounded-md bg-warning/15 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-warning">
              {t("preset.modified")}
            </span>
          ) : (
            <span className="shrink-0 rounded-md bg-mint/15 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-mint">
              {t("preset.synced")}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-muted-foreground"
            onClick={formatJson}
          >
            <AlignLeft className="size-3.5" strokeWidth={1.75} />
            {t("preset.format")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-muted-foreground"
            disabled={!dirty}
            onClick={() => {
              setEditorText(baseline);
              setError(null);
            }}
          >
            <RotateCcw className="size-3.5" strokeWidth={1.75} />
            {t("preset.revert")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-muted-foreground"
            disabled={text === defaultsText}
            onClick={() => {
              setEditorText(defaultsText);
              setError(null);
            }}
          >
            <ListRestart className="size-3.5" strokeWidth={1.75} />
            {t("preset.resetDefault")}
          </Button>
          <Button type="button" size="sm" disabled={!live.ok} onClick={apply}>
            {t("preset.apply")}
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 flex min-h-0">
          <div
            ref={guttersRef}
            aria-hidden
            className="w-11 shrink-0 overflow-hidden border-r border-line-soft bg-sidebar/50 select-none"
          >
            <div className="py-3 font-mono text-[12px] leading-5 text-faint">
              {lines.map((n) => (
                <div key={n} className="pr-2 text-right tabular-nums">
                  {n}
                </div>
              ))}
            </div>
          </div>

          <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
            <pre
              ref={highlightRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 m-0 overflow-auto px-4 py-3 font-mono text-[12px] leading-5 whitespace-pre [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ color: VS.punct }}
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
            <textarea
              ref={areaRef}
              value={text}
              spellCheck={false}
              wrap="off"
              onScroll={syncScroll}
              onKeyDown={onKeyDown}
              onChange={(event) => {
                setText(event.target.value);
                if (error) setError(null);
              }}
              className={cn(
                "absolute inset-0 z-10 m-0 h-full w-full resize-none overflow-auto border-0 bg-transparent px-4 py-3",
                "font-mono text-[12px] leading-5 text-transparent caret-bright outline-none",
                "selection:bg-primary/25 selection:text-transparent",
              )}
            />
          </div>
        </div>
      </div>

      {error || !live.ok ? (
        <div className="shrink-0 border-t border-destructive/25 bg-destructive/10 px-4 py-2 text-[12px] text-destructive">
          {error ?? (!live.ok ? live.error : null)}
        </div>
      ) : null}

      <div className="flex h-9 shrink-0 items-center gap-x-3 border-t border-line-soft bg-sidebar/60 px-4 font-mono text-[11px] text-faint">
        <span>{t("preset.lines", { count: lineCount })}</span>
        <span className="text-line">·</span>
        {live.ok ? (
          <span className="inline-flex items-center gap-1 text-mint">
            <Check className="size-3" strokeWidth={2.5} />
            {t("preset.count", { count: live.count })}
          </span>
        ) : (
          <span className="text-destructive">{t("preset.jsonError")}</span>
        )}
        <span className="ml-auto hidden sm:inline">{t("preset.hint")}</span>
      </div>

      <ConfirmDialog
        open={confirmBack}
        title={t("preset.confirm.back.title")}
        body={t("preset.confirm.back.body")}
        danger
        onCancel={() => setConfirmBack(false)}
        onConfirm={() => {
          setConfirmBack(false);
          onBack();
        }}
      />
    </div>
  );
}

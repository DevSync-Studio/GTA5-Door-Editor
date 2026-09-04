import { useMemo, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DOOR_FLAG_SUGGESTIONS } from "@/domain/constants";
import { cn } from "@/lib/utils";

export function parseFlagTokens(value: string): string[] {
  return value
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function serializeFlagTokens(tokens: string[]): string {
  return tokens.join(" ");
}

interface FlagTokensInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function FlagTokensInput({ value, onChange, className }: FlagTokensInputProps) {
  const [draft, setDraft] = useState("");
  const tokens = useMemo(() => parseFlagTokens(value), [value]);

  const available = useMemo(
    () =>
      DOOR_FLAG_SUGGESTIONS.filter(
        (flag) => !tokens.some((token) => token.toLowerCase() === flag.toLowerCase()),
      ),
    [tokens],
  );

  const commit = (raw: string) => {
    const nextToken = raw.trim();
    if (!nextToken) return;
    if (tokens.some((token) => token.toLowerCase() === nextToken.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange(serializeFlagTokens([...tokens, nextToken]));
    setDraft("");
  };

  const remove = (index: number) => {
    onChange(serializeFlagTokens(tokens.filter((_, i) => i !== index)));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit(draft);
      return;
    }
    if (event.key === "Backspace" && !draft && tokens.length) {
      remove(tokens.length - 1);
    }
  };

  return (
    <div className={cn("min-w-0 space-y-3", className)}>
      <div
        className={cn(
          "flex min-h-46 w-full min-w-0 flex-wrap content-start items-start gap-2 overflow-hidden rounded-lg border border-input bg-transparent px-3 py-3.5 dark:bg-input/30",
          "focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/35",
        )}
      >
        {tokens.map((token, index) => (
          <Badge
            key={`${token}-${index}`}
            variant="secondary"
            className="h-auto max-w-full gap-1.5 rounded-md border border-border/50 px-2.5 py-1 pr-1 font-mono text-[11px] leading-snug break-all whitespace-normal"
          >
            <span className="min-w-0">{token}</span>
            <button
              type="button"
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Remove ${token}`}
              onClick={() => remove(index)}
            >
              <X className="size-3.5" strokeWidth={2} />
            </button>
          </Badge>
        ))}
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
          placeholder={tokens.length ? "Add..." : "Type a flag, Enter to add"}
          className="h-8 min-w-[7rem] flex-1 border-0 bg-transparent px-1 text-[13px] shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
        />
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <Select
          key={available.join("|")}
          onValueChange={(flag) => commit(flag)}
          disabled={available.length === 0}
        >
          <SelectTrigger className="h-11 w-full min-w-0 data-[size=default]:h-11">
            <SelectValue
              placeholder={available.length ? "Pick a known flag" : "No more known flags"}
            />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-64">
            {available.map((flag) => (
              <SelectItem key={flag} value={flag}>
                <span className="font-mono text-[12px]">{flag}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {draft.trim() ? (
          <Button type="button" size="default" variant="outline" className="h-11 shrink-0" onClick={() => commit(draft)}>
            Add
          </Button>
        ) : null}
      </div>
    </div>
  );
}

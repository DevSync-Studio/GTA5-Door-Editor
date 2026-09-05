import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UnsavedChangesBarProps {
  open: boolean;
  saving?: boolean;
  onReset: () => void;
  onSave: () => void;
  className?: string;
  description?: string;
  saveLabel?: string;
}

export function UnsavedChangesBar({
  open,
  saving = false,
  onReset,
  onSave,
  className,
  description = "Save keeps these edits in the current session.",
  saveLabel = "Save",
}: UnsavedChangesBarProps) {
  if (!open) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center px-3 sm:px-5",
        className,
      )}
    >
      <div className="pointer-events-auto flex w-full max-w-5xl items-center justify-between gap-6 rounded-lg border border-line-soft bg-panel-elevated px-5 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)]">
        <div className="min-w-0">
          <p className="m-0 text-[13px] font-medium text-bright">Pending edits</p>
          <p className="m-0 mt-0.5 text-[12px] text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-bright"
            disabled={saving}
            onClick={onReset}
          >
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-[#248046] text-white hover:bg-[#1a6334] active:bg-[#15522b]"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? "Saving..." : saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

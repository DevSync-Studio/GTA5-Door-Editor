import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import appLogo from "../../logo.png";

const titleCtrl =
  "inline-flex h-[var(--titlebar-h)] w-11 shrink-0 items-center justify-center border-0 bg-transparent text-faint outline-none transition-[color,background-color] duration-150 hover:bg-white/[0.06] hover:text-bright active:bg-white/[0.1]";

function TitleBrand() {
  return (
    <span className="pointer-events-none flex items-center gap-2 text-[13px] font-semibold tracking-tight text-bright">
      <img src={appLogo} alt="" className="size-5 rounded-[4px] object-cover" draggable={false} />
      <span>
        <span className="text-mint">GTA5</span> Door Editor
      </span>
    </span>
  );
}

export function WindowTitlebar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void win.isMaximized().then(setMaximized);
    void win
      .onResized(() => {
        void win.isMaximized().then(setMaximized);
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  const withWindow = useCallback((action: (win: ReturnType<typeof getCurrentWindow>) => void) => {
    if (!isTauri()) return;
    action(getCurrentWindow());
  }, []);

  if (!isTauri()) {
    return (
      <header className="flex h-[var(--titlebar-h)] shrink-0 items-center border-b border-line-soft bg-activity/95 px-4 backdrop-blur-sm">
        <TitleBrand />
      </header>
    );
  }

  return (
    <header
      className={cn(
        "relative flex h-[var(--titlebar-h)] shrink-0 select-none items-stretch",
        "border-b border-line-soft bg-activity/95 backdrop-blur-sm",
      )}
    >
      <div
        className="absolute inset-y-0 left-0 right-[132px] z-0"
        data-tauri-drag-region
        onDoubleClick={() => withWindow((win) => void win.toggleMaximize())}
      />

      <div className="relative z-[1] flex h-[var(--titlebar-h)] shrink-0 items-center pl-4 pr-2">
        <TitleBrand />
      </div>

      <div className="relative z-[1] min-w-0 flex-1" data-tauri-drag-region />

      <div
        className="relative z-[2] flex shrink-0 items-stretch border-l border-line-soft"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={titleCtrl}
          title="Minimize"
          aria-label="Minimize"
          onClick={() => withWindow((win) => void win.minimize())}
        >
          <Minus className="size-3.5" strokeWidth={2} />
        </button>
        <button
          type="button"
          className={titleCtrl}
          title={maximized ? "Restore" : "Maximize"}
          aria-label={maximized ? "Restore" : "Maximize"}
          onClick={() => withWindow((win) => void win.toggleMaximize())}
        >
          {maximized ? (
            <Copy className="size-3 rotate-90" strokeWidth={2} />
          ) : (
            <Square className="size-3" strokeWidth={2} />
          )}
        </button>
        <button
          type="button"
          className={cn(
            titleCtrl,
            "hover:bg-[#e81123] hover:text-white active:bg-[#c50e1e] active:text-white",
          )}
          title="Close"
          aria-label="Close"
          onClick={() => withWindow((win) => void win.close())}
        >
          <X className="size-3.5" strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}

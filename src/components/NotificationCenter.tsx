import { useSyncExternalStore, useState } from "react";
import { BadgeInfo, Bell, BellOff, Upload, ListX, OctagonAlert, SaveCheck, X } from "lucide-react";
import {
  clearNotifications,
  dismissNotification,
  getNotifications,
  getNotificationsMuted,
  subscribeNotifications,
  toggleNotificationsMuted,
  type AppNotification,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

function useNotificationState() {
  const items = useSyncExternalStore(
    subscribeNotifications,
    getNotifications,
    getNotifications,
  );
  const muted = useSyncExternalStore(
    subscribeNotifications,
    getNotificationsMuted,
    getNotificationsMuted,
  );
  return { items, muted };
}

function timeLabel(at: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

function iconFor(kind: AppNotification["kind"]) {
  switch (kind) {
    case "error":
      return { Icon: OctagonAlert, className: "text-destructive" };
    case "save":
      return { Icon: SaveCheck, className: "text-success" };
    case "export":
      return { Icon: Upload, className: "text-blue" };
    default:
      return { Icon: BadgeInfo, className: "text-blue" };
  }
}

function NotificationCard({
  item,
  onDismiss,
}: {
  item: AppNotification;
  onDismiss: (id: string) => void;
}) {
  const { Icon, className } = iconFor(item.kind);
  return (
    <div className="group relative border-b border-line-soft px-3 py-2.5 last:border-b-0">
      <div className="flex gap-2.5 pr-6">
        <Icon className={cn("mt-0.5 size-4 shrink-0", className)} strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[12.5px] leading-5 text-bright">{item.message}</p>
          <p className="m-0 mt-1 text-[11px] text-faint">{timeLabel(item.at)}</p>
        </div>
      </div>
      <button
        type="button"
        title="Dismiss"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(item.id)}
        className="absolute top-2 right-2 inline-flex size-5 items-center justify-center rounded text-faint opacity-0 transition-opacity hover:bg-hover hover:text-bright group-hover:opacity-100"
      >
        <X className="size-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}

export function NotificationCenter() {
  const { items, muted } = useNotificationState();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        title={open ? "Hide notifications" : "Show notifications"}
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "relative inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors",
          "hover:bg-primary/10 hover:text-bright",
          open && "bg-primary/10 text-bright",
        )}
      >
        {muted ? (
          <BellOff className="size-3.5" strokeWidth={1.75} />
        ) : (
          <Bell className="size-3.5" strokeWidth={1.75} />
        )}
        {items.length > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 font-mono text-[8px] font-semibold text-primary-foreground">
            {items.length > 9 ? "9+" : items.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 bottom-[calc(100%+8px)] z-50 flex w-[360px] max-w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden rounded-md border border-line-soft bg-panel-elevated shadow-[0_8px_28px_rgba(0,0,0,0.45)]">
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-line-soft px-3">
              <span className="text-[12px] font-medium text-bright">Notifications</span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  title="Clear all"
                  aria-label="Clear all notifications"
                  disabled={items.length === 0}
                  onClick={() => clearNotifications()}
                  className="inline-flex size-6 items-center justify-center rounded text-faint transition-colors hover:bg-hover hover:text-bright disabled:opacity-40"
                >
                  <ListX className="size-3.5" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  title={muted ? "Enable toast popups" : "Do not disturb (hide toasts)"}
                  aria-label={muted ? "Enable toast popups" : "Do not disturb"}
                  onClick={() => toggleNotificationsMuted()}
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded text-faint transition-colors hover:bg-hover hover:text-bright",
                    muted && "text-warning",
                  )}
                >
                  {muted ? (
                    <BellOff className="size-3.5" strokeWidth={1.75} />
                  ) : (
                    <Bell className="size-3.5" strokeWidth={1.75} />
                  )}
                </button>
                <button
                  type="button"
                  title="Hide"
                  aria-label="Hide notifications"
                  onClick={() => setOpen(false)}
                  className="inline-flex size-6 items-center justify-center rounded text-faint transition-colors hover:bg-hover hover:text-bright"
                >
                  <X className="size-3.5" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <div className="max-h-[min(420px,50vh)] overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-3 py-8 text-center text-[12px] text-faint">
                  No notifications
                </div>
              ) : (
                items.map((item) => (
                  <NotificationCard
                    key={item.id}
                    item={item}
                    onDismiss={dismissNotification}
                  />
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

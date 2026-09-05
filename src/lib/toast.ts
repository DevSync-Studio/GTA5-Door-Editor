import { createElement } from "react";
import { Download, SaveCheck } from "lucide-react";
import { toast as sonnerToast } from "sonner";
import {
  getNotificationsMuted,
  pushNotification,
  type NotificationKind,
} from "@/lib/notifications";

export type ToastKind = NotificationKind | boolean;

function resolveKind(opts: ToastKind = "info"): NotificationKind {
  if (opts === true) return "error";
  if (opts === false) return "info";
  return opts;
}

let lastKey = "";
let lastAt = 0;

const DEDUPE_MS = 600;

export function toast(message: string, opts: ToastKind = "info") {
  const kind = resolveKind(opts);
  const key = `${kind}:${message}`;
  const now = Date.now();
  if (key === lastKey && now - lastAt < DEDUPE_MS) return;
  lastKey = key;
  lastAt = now;

  pushNotification(message, kind);
  if (getNotificationsMuted()) return;

  if (kind === "error") {
    sonnerToast.error(message, { id: key });
    return;
  }
  if (kind === "save") {
    sonnerToast.success(message, {
      id: key,
      icon: createElement(SaveCheck, { className: "size-4 text-success", strokeWidth: 1.75 }),
    });
    return;
  }
  if (kind === "export") {
    sonnerToast.message(message, {
      id: key,
      icon: createElement(Download, { className: "size-4 text-blue", strokeWidth: 1.75 }),
    });
    return;
  }
  sonnerToast.message(message, { id: key });
}

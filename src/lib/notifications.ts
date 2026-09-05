export type NotificationKind = "info" | "error" | "save" | "export";

export type AppNotification = {
  id: string;
  message: string;
  kind: NotificationKind;
  source: string;
  at: number;
};

const MAX = 40;
let items: AppNotification[] = [];
let muted = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getNotifications(): AppNotification[] {
  return items;
}

export function getNotificationsMuted(): boolean {
  return muted;
}

export function subscribeNotifications(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pushNotification(
  message: string,
  kind: NotificationKind = "info",
  source = "GTA5 Door Editor",
): AppNotification {
  const next: AppNotification = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    message,
    kind,
    source,
    at: Date.now(),
  };
  items = [next, ...items].slice(0, MAX);
  emit();
  return next;
}

export function dismissNotification(id: string) {
  items = items.filter((item) => item.id !== id);
  emit();
}

export function clearNotifications() {
  items = [];
  emit();
}

export function setNotificationsMuted(value: boolean) {
  if (muted === value) return;
  muted = value;
  emit();
}

export function toggleNotificationsMuted() {
  muted = !muted;
  emit();
  return muted;
}

"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

type NotificationType = "success" | "error" | "info";

interface Notification {
  id: number;
  type: NotificationType;
  message: string;
}

interface NotifyOptions {
  type: NotificationType;
  message: string;
  durationMs?: number;
}

interface NotificationsContextValue {
  notify: (options: NotifyOptions) => void;
  dismiss: (id: number) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function generateId() {
  return Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const dismiss = useCallback((id: number) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id));
  }, []);

  const notify = useCallback(
    ({ type, message, durationMs = 5000 }: NotifyOptions) => {
      const id = generateId();
      setNotifications((current) => [...current, { id, type, message }]);
      if (durationMs > 0) {
        window.setTimeout(() => {
          dismiss(id);
        }, durationMs);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-3">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={notificationClassName(notification.type)}
            role="alert"
          >
            <div className="flex items-start gap-3">
              <span className="text-sm text-current">{notification.message}</span>
              <button
                type="button"
                className="text-current transition hover:opacity-80"
                onClick={() => dismiss(notification.id)}
              >
                <span className="sr-only">Dismiss</span>
                X
              </button>
            </div>
          </div>
        ))}
      </div>
    </NotificationsContext.Provider>
  );
}

function notificationClassName(type: NotificationType) {
  const base =
    "pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur";
  switch (type) {
    case "success":
      return `${base} border-emerald-400/40 bg-emerald-500/10 text-emerald-100`;
    case "error":
      return `${base} border-red-400/40 bg-red-500/10 text-red-100`;
    default:
      return `${base} border-white/10 bg-white/10 text-zinc-100`;
  }
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
}

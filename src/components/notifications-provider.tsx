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
              <span className="text-sm text-zinc-900">{notification.message}</span>
              <button
                type="button"
                className="text-zinc-500 transition hover:text-zinc-700"
                onClick={() => dismiss(notification.id)}
              >
                <span className="sr-only">Dismiss</span>
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </NotificationsContext.Provider>
  );
}

function notificationClassName(type: NotificationType) {
  const base = "pointer-events-auto rounded-md border px-4 py-3 shadow-lg";
  switch (type) {
    case "success":
      return `${base} border-emerald-200 bg-emerald-50`;
    case "error":
      return `${base} border-red-200 bg-red-50`;
    default:
      return `${base} border-zinc-200 bg-white`;
  }
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
}

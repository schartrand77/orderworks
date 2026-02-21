"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then(async (registrations) => {
          await Promise.all(registrations.map((registration) => registration.unregister()));
        })
        .catch((error) => {
          console.warn("Service worker cleanup failed in development:", error);
        });

      if ("caches" in window) {
        void caches
          .keys()
          .then(async (keys) => {
            await Promise.all(keys.map((key) => caches.delete(key)));
          })
          .catch((error) => {
            console.warn("Cache cleanup failed in development:", error);
          });
      }
      return;
    }

    if (!window.isSecureContext) {
      console.warn(
        `[PWA] Service workers require a secure context. Open this app on https:// or http://localhost (current origin: ${window.location.origin}).`,
      );
      return;
    }

    let refreshing = false;
    const handleControllerChange = () => {
      if (refreshing) {
        return;
      }
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => registration.update())
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  return null;
}

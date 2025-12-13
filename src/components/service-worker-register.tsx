"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    if (!window.isSecureContext) {
      console.warn(
        `[PWA] Service workers require a secure context. Open this app on https:// or http://localhost (current origin: ${window.location.origin}).`,
      );
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  }, []);

  return null;
}

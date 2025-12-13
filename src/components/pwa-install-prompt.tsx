"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandaloneDisplayMode() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  const shouldShow = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    if (!window.isSecureContext) {
      return false;
    }
    if (installed || isStandaloneDisplayMode()) {
      return false;
    }
    return deferredPrompt !== null;
  }, [deferredPrompt, installed]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) {
      return;
    }
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => null);
    } finally {
      setDeferredPrompt(null);
    }
  };

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>Add OrderWorks to your home screen for quicker access.</span>
        <button
          type="button"
          onClick={install}
          className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-400"
        >
          Install
        </button>
      </div>
    </div>
  );
}


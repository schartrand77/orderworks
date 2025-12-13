"use client";

import { useEffect } from "react";

export default function PwaStartPage() {
  useEffect(() => {
    window.location.replace("/");
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 py-10 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0a]/90 p-8 text-center shadow-[0_30px_70px_rgba(0,0,0,0.7)]">
        <p className="text-sm text-zinc-300">Opening OrderWorks…</p>
      </div>
    </main>
  );
}

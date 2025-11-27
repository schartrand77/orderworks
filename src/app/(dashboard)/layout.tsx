import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { readAdminSessionTokenFromHeaders, validateAdminSessionToken } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const token = await readAdminSessionTokenFromHeaders();
  if (!validateAdminSessionToken(token)) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen text-white">
      <header className="border-b border-white/10 bg-[#080808]/90 shadow-[0_10px_40px_rgba(0,0,0,0.65)] backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-6">
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.55em] text-zinc-400">
            MakerWorks Fabrication
          </span>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-2xl font-semibold tracking-wide text-zinc-50">OrderWorks Admin</p>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-zinc-300">
                Jobs dashboard
              </span>
              <LogoutButton />
            </div>
          </div>
          <p className="text-sm text-zinc-400">
            Intake, prioritize, and complete MakerWorks fabrication requests.
          </p>
        </div>
      </header>
      {children}
    </div>
  );
}

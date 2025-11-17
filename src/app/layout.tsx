import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NotificationsProvider } from "@/components/notifications-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OrderWorks Admin",
  description: "Administer MakerWorks fabrication jobs, webhook ingestion, and fulfillment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} bg-transparent text-white`}>
        <NotificationsProvider>
          <div className="min-h-screen text-white">
            <header className="border-b border-white/10 bg-[#080808]/90 shadow-[0_10px_40px_rgba(0,0,0,0.65)] backdrop-blur-sm">
              <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-6">
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.55em] text-zinc-400">
                  MakerWorks Fabrication
                </span>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-2xl font-semibold tracking-wide text-zinc-50">OrderWorks Admin</p>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-zinc-300">
                    Jobs dashboard
                  </span>
                </div>
                <p className="text-sm text-zinc-400">
                  Intake, prioritize, and complete MakerWorks fabrication requests.
                </p>
              </div>
            </header>
            {children}
          </div>
        </NotificationsProvider>
      </body>
    </html>
  );
}

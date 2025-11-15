import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
      <body className={`${geistSans.variable} ${geistMono.variable} bg-zinc-100 antialiased`}>
        <div className="min-h-screen">
          <header className="border-b border-zinc-200 bg-white">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-6 py-4">
              <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                OrderWorks
              </span>
              <p className="text-sm text-zinc-700">
                MakerWorks job intake and fulfillment dashboard
              </p>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}

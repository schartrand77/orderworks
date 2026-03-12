"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/components/notifications-provider";
import { buildCsrfHeaders, handleUnauthorizedResponse } from "@/lib/client-auth";

export function OperationsToolbox() {
  const router = useRouter();
  const { notify } = useNotifications();
  const [scanCode, setScanCode] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handlePickupScan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scanCode.trim() || isScanning) {
      return;
    }

    setIsScanning(true);
    try {
      const response = await fetch("/api/jobs/pickup", {
        method: "POST",
        headers: buildCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ code: scanCode.trim() }),
      });
      if (handleUnauthorizedResponse(response.status)) {
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "Pickup update failed");
      }
      notify({
        type: "success",
        message: `Marked picked up: ${body.job?.paymentIntentId ?? scanCode.trim()}`,
      });
      setScanCode("");
      router.refresh();
    } catch (error) {
      notify({ type: "error", message: error instanceof Error ? error.message : "Pickup update failed" });
    } finally {
      setIsScanning(false);
    }
  }

  async function handleCsvImport() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || isImporting) {
      return;
    }
    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/jobs/csv/import", {
        method: "POST",
        headers: buildCsrfHeaders(),
        body: formData,
      });
      if (handleUnauthorizedResponse(response.status)) {
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "CSV import failed");
      }
      const errorCount = Array.isArray(body.errors) ? body.errors.length : 0;
      notify({
        type: errorCount > 0 ? "info" : "success",
        message: `CSV import complete. Updated ${body.updated ?? 0}, invoices ${body.invoicesSent ?? 0}, errors ${errorCount}.`,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      router.refresh();
    } catch (error) {
      notify({ type: "error", message: error instanceof Error ? error.message : "CSV import failed" });
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_25px_70px_rgba(0,0,0,0.55)]">
      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-300">Ops toolbox</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <form onSubmit={handlePickupScan} className="rounded-xl border border-white/10 bg-black/30 p-4">
          <p className="text-sm font-semibold text-white">Barcode/QR pickup</p>
          <p className="mt-1 text-xs text-zinc-400">Scan or paste job code (paymentIntentId or job id).</p>
          <input
            value={scanCode}
            onChange={(event) => setScanCode(event.target.value)}
            placeholder="pi_123... or job-id"
            className="mt-3 w-full rounded-md border border-white/10 bg-[#080808] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
          />
          <button
            type="submit"
            disabled={isScanning || !scanCode.trim()}
            className="mt-3 rounded-md border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isScanning ? "Updating..." : "Confirm pickup"}
          </button>
        </form>

        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
          <p className="text-sm font-semibold text-white">CSV export</p>
          <p className="mt-1 text-xs text-zinc-400">Download queue data for external systems or bulk edits.</p>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/api/jobs/csv/export";
            }}
            className="mt-3 inline-block rounded-md border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/20"
          >
            Download CSV
          </button>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
          <p className="text-sm font-semibold text-white">CSV import</p>
          <p className="mt-1 text-xs text-zinc-400">
            Columns: paymentIntentId, status, fulfillmentStatus, notes, viewed, sendInvoice.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="mt-3 block w-full text-xs text-zinc-300 file:mr-2 file:rounded-md file:border file:border-white/15 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
          />
          <button
            type="button"
            onClick={() => {
              void handleCsvImport();
            }}
            disabled={isImporting}
            className="mt-3 rounded-md border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isImporting ? "Importing..." : "Import CSV"}
          </button>
        </div>
      </div>
    </section>
  );
}

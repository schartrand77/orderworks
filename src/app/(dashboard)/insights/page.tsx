import Link from "next/link";
import { DashboardOperationsInsights } from "@/components/dashboard-operations-insights";
import { ExceptionQueue } from "@/components/exception-queue";
import { ShiftHandoffSummary } from "@/components/shift-handoff-summary";
import { loadExceptionQueue, loadShiftHandoffSummary } from "@/lib/dashboard-insights";
import { loadCapacityForecast, loadSlaMetrics, parseCapacityPrinters, parseSlaThresholds } from "@/lib/dashboard-kpis";

export const dynamic = "force-dynamic";

interface SearchParams {
  [key: string]: string | string[] | undefined;
  since?: string | string[];
  warningHours?: string | string[];
  breachHours?: string | string[];
  printers?: string | string[];
}

function extractSingle(value?: string | string[]) {
  if (!value) {
    return undefined;
  }
  return Array.isArray(value) ? value[value.length - 1] : value;
}

function parseSince(value?: string) {
  if (!value) {
    return new Date(Date.now() - 8 * 60 * 60 * 1000);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(Date.now() - 8 * 60 * 60 * 1000);
  }
  return parsed;
}

export default async function InsightsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const since = parseSince(extractSingle(resolvedSearchParams?.since));
  const thresholds = parseSlaThresholds(
    extractSingle(resolvedSearchParams?.warningHours),
    extractSingle(resolvedSearchParams?.breachHours),
  );
  const printers = parseCapacityPrinters(extractSingle(resolvedSearchParams?.printers));

  const [shiftHandoff, exceptionQueue, capacity, sla] = await Promise.all([
    loadShiftHandoffSummary(since),
    loadExceptionQueue(40),
    loadCapacityForecast(printers),
    loadSlaMetrics(thresholds),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6 text-zinc-50">
      <section className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <h1 className="text-lg font-semibold text-white">Insights</h1>
        <p className="mt-1 text-sm text-zinc-300">Capacity, SLA aging, shift handoff, and exception triage.</p>
        <div className="mt-3">
          <Link
            href="/"
            className="rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-white/40 hover:bg-white/20"
          >
            Back to Queue
          </Link>
        </div>
      </section>
      <ShiftHandoffSummary {...shiftHandoff} />
      <DashboardOperationsInsights capacity={capacity} sla={sla} thresholds={thresholds} />
      <ExceptionQueue items={exceptionQueue} />
    </main>
  );
}

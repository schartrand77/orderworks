import { formatDate } from "@/lib/format";
import type { CapacityForecast, SlaMetrics, SlaThresholds } from "@/lib/dashboard-kpis";

interface Props {
  capacity: CapacityForecast;
  sla: SlaMetrics;
  thresholds: SlaThresholds;
}

function formatMinutes(minutes: number) {
  if (minutes <= 0) {
    return "0m";
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours === 0) {
    return `${remaining}m`;
  }
  return remaining === 0 ? `${hours}h` : `${hours}h ${remaining}m`;
}

export function DashboardOperationsInsights({ capacity, sla, thresholds }: Props) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_25px_70px_rgba(0,0,0,0.55)]">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-300">Capacity forecasting</h2>
        <p className="mt-2 text-sm text-zinc-300">
          Queue sampled: {capacity.consideredJobs} active jobs across {capacity.printers} printer(s).
        </p>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Metric label="Estimated queue load" value={formatMinutes(capacity.totalEstimatedMinutes)} />
          <Metric
            label="Estimated clear time"
            value={capacity.estimatedClearAt ? formatDate(capacity.estimatedClearAt) : "Insufficient estimates"}
          />
          <Metric label="Front queue (first 10)" value={formatMinutes(capacity.frontQueueMinutes)} />
          <Metric label="Tail queue" value={formatMinutes(capacity.tailQueueMinutes)} />
          <Metric label="Jobs with estimates" value={`${capacity.jobsWithEstimate}`} />
          <Metric label="Jobs missing estimates" value={`${capacity.unknownEstimateJobs}`} />
        </div>
      </article>
      <article className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_25px_70px_rgba(0,0,0,0.55)]">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-300">SLA / aging dashboard</h2>
        <p className="mt-2 text-sm text-zinc-300">
          Warning at {thresholds.warningHours}h, breach at {thresholds.breachHours}h.
        </p>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Metric label="Open jobs" value={`${sla.openJobs}`} />
          <Metric label="Oldest age" value={`${sla.oldestAgeHours}h`} />
          <Metric
            label="Warning jobs"
            value={`${sla.warningJobs}`}
            emphasized={sla.warningJobs > 0}
            tone="warning"
          />
          <Metric
            label="Breached jobs"
            value={`${sla.breachedJobs}`}
            emphasized={sla.breachedJobs > 0}
            tone="danger"
          />
        </div>
      </article>
    </section>
  );
}

function Metric({
  label,
  value,
  emphasized = false,
  tone = "neutral",
}: {
  label: string;
  value: string;
  emphasized?: boolean;
  tone?: "neutral" | "warning" | "danger";
}) {
  let className = "rounded-xl border border-white/10 bg-black/30 p-3";
  if (emphasized && tone === "warning") {
    className = "rounded-xl border border-amber-300/40 bg-amber-500/10 p-3";
  } else if (emphasized && tone === "danger") {
    className = "rounded-xl border border-red-300/45 bg-red-500/12 p-3";
  }

  return (
    <div className={className}>
      <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

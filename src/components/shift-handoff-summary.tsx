import { formatDate } from "@/lib/format";

interface Props {
  since: Date;
  now: Date;
  newJobs: number;
  completedJobs: number;
  exceptionsSinceShift: number;
}

export function ShiftHandoffSummary({ since, now, newJobs, completedJobs, exceptionsSinceShift }: Props) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_25px_70px_rgba(0,0,0,0.55)]">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-300">Shift handoff summary</h2>
        <p className="text-xs text-zinc-400">
          {formatDate(since)} to {formatDate(now)}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="New jobs" value={newJobs} />
        <SummaryCard label="Completed jobs" value={completedJobs} />
        <SummaryCard label="Exceptions" value={exceptionsSinceShift} danger={exceptionsSinceShift > 0} />
      </div>
    </section>
  );
}

function SummaryCard({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        danger ? "border-red-400/30 bg-red-500/10" : "border-white/10 bg-black/30"
      }`}
    >
      <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${danger ? "text-red-100" : "text-white"}`}>{value}</p>
    </div>
  );
}

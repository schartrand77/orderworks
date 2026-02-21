import { formatDate } from "@/lib/format";
import { getAuditEventLabel, type JobAuditEvent } from "@/lib/job-audit";

interface Props {
  events: JobAuditEvent[];
}

export function JobAuditTimeline({ events }: Props) {
  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
      <div>
        <h2 className="text-lg font-semibold text-white">Timeline / audit trail</h2>
        <p className="text-sm text-zinc-400">Status, notes, invoice, receipt, and queue actions.</p>
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-zinc-300">No timeline events recorded yet.</p>
      ) : (
        <ol className="space-y-3">
          {events.map((event) => (
            <li key={event.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">{getAuditEventLabel(event.eventType)}</p>
                <p className="text-xs text-zinc-400">{formatDate(new Date(event.createdAt))}</p>
              </div>
              {event.actor ? <p className="mt-1 text-xs text-zinc-500">Actor: {event.actor}</p> : null}
              {event.details && typeof event.details === "object" ? (
                <pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-2 text-[0.7rem] text-zinc-300">
                  {JSON.stringify(event.details, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

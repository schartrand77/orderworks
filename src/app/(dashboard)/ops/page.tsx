import Link from "next/link";
import { OperationsToolbox } from "@/components/operations-toolbox";

export const dynamic = "force-dynamic";

export default function OpsPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6 text-zinc-50">
      <section className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <h1 className="text-lg font-semibold text-white">Operations</h1>
        <p className="mt-1 text-sm text-zinc-300">Pickup scanning and CSV bulk edit tools.</p>
        <div className="mt-3">
          <Link
            href="/"
            className="rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-white/40 hover:bg-white/20"
          >
            Back to Queue
          </Link>
        </div>
      </section>
      <OperationsToolbox />
    </main>
  );
}

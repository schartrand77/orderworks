import { formatCurrency } from "@/lib/format";
import { getAccountingDashboardData, syncAllAccountingFromJobs } from "@/lib/accounting";
import { syncMakerWorksJobs } from "@/lib/makerworks-sync";

export const dynamic = "force-dynamic";

function formatMoney(amountCents: number, currency: string) {
  return formatCurrency(amountCents, currency);
}

function MetricCard({
  label,
  values,
}: {
  label: string;
  values: Record<string, number>;
}) {
  const entries = Object.entries(values);
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">{label}</p>
      <div className="mt-4 space-y-2">
        {entries.length > 0 ? (
          entries.map(([currency, amountCents]) => (
            <div key={currency} className="flex items-end justify-between gap-3">
              <span className="text-sm text-zinc-400">{currency}</span>
              <span className="text-lg font-semibold text-white">{formatMoney(amountCents, currency)}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-zinc-500">No activity yet.</p>
        )}
      </div>
    </article>
  );
}

export default async function AccountingPage() {
  await syncMakerWorksJobs();
  await syncAllAccountingFromJobs();
  const data = await getAccountingDashboardData();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8 text-zinc-50">
      <section className="space-y-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Accounting</h1>
          <p className="text-sm text-zinc-400">
            Double-entry ledger generated from OrderWorks jobs, invoices, and payment status.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Cash" values={data.metrics.cashByCurrency} />
          <MetricCard label="Accounts Receivable" values={data.metrics.receivablesByCurrency} />
          <MetricCard label="Revenue" values={data.metrics.revenueByCurrency} />
          <MetricCard label="Net Income" values={data.metrics.netIncomeByCurrency} />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <article className="rounded-2xl border border-white/10 bg-[#080808]/90 p-6 shadow-[0_25px_60px_rgba(0,0,0,0.45)]">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-white">Balance sheet</h2>
              <p className="text-sm text-zinc-400">
                Assets, liabilities, and equity based on journaled job activity.
              </p>
            </div>
            <div className="space-y-6">
              {data.balanceSheet.length > 0 ? (
                data.balanceSheet.map((statement) => (
                  <div key={statement.currency} className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-zinc-400">
                        {statement.currency}
                      </h3>
                      <span className="text-xs text-zinc-500">
                        Assets {formatMoney(statement.totalAssetsCents, statement.currency)} | Liabilities + Equity{" "}
                        {formatMoney(statement.totalLiabilitiesCents + statement.totalEquityCents, statement.currency)}
                      </span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Assets</p>
                        <div className="space-y-2">
                          {statement.assets.map((account) => (
                            <div key={account.code} className="flex justify-between gap-3 text-sm">
                              <span className="text-zinc-300">{account.name}</span>
                              <span className="text-white">{formatMoney(account.balanceCents, statement.currency)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">
                          Liabilities
                        </p>
                        <div className="space-y-2">
                          {statement.liabilities.length > 0 ? (
                            statement.liabilities.map((account) => (
                              <div key={account.code} className="flex justify-between gap-3 text-sm">
                                <span className="text-zinc-300">{account.name}</span>
                                <span className="text-white">{formatMoney(account.balanceCents, statement.currency)}</span>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-zinc-500">No liabilities posted.</p>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Equity</p>
                        <div className="space-y-2">
                          {statement.equity.map((account) => (
                            <div key={account.code} className="flex justify-between gap-3 text-sm">
                              <span className="text-zinc-300">{account.name}</span>
                              <span className="text-white">{formatMoney(account.balanceCents, statement.currency)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between gap-3 border-t border-white/10 pt-2 text-sm">
                            <span className="text-zinc-300">Current earnings</span>
                            <span className="text-white">{formatMoney(statement.currentEarningsCents, statement.currency)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500">No accounting entries available.</p>
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-[#080808]/90 p-6 shadow-[0_25px_60px_rgba(0,0,0,0.45)]">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-white">Income statement</h2>
              <p className="text-sm text-zinc-400">
                Revenue and expenses recognized from ledger activity.
              </p>
            </div>
            <div className="space-y-4">
              {data.incomeStatement.length > 0 ? (
                data.incomeStatement.map((statement) => (
                  <div key={statement.currency} className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-zinc-400">
                        {statement.currency}
                      </h3>
                      <span className="text-sm font-semibold text-white">
                        Net income {formatMoney(statement.netIncomeCents, statement.currency)}
                      </span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Revenue</p>
                        <div className="space-y-2">
                          {statement.revenueAccounts.map((account) => (
                            <div key={account.code} className="flex justify-between gap-3 text-sm">
                              <span className="text-zinc-300">{account.name}</span>
                              <span className="text-white">{formatMoney(account.balanceCents, statement.currency)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Expenses</p>
                        <div className="space-y-2">
                          {statement.expenseAccounts.length > 0 ? (
                            statement.expenseAccounts.map((account) => (
                              <div key={account.code} className="flex justify-between gap-3 text-sm">
                                <span className="text-zinc-300">{account.name}</span>
                                <span className="text-white">{formatMoney(account.balanceCents, statement.currency)}</span>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-zinc-500">No expense accounts posted yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500">No revenue or expenses recognized yet.</p>
              )}
            </div>
          </article>
        </div>

        <article className="rounded-2xl border border-white/10 bg-[#080808]/90 p-6 shadow-[0_25px_60px_rgba(0,0,0,0.45)]">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-white">Recent journal entries</h2>
            <p className="text-sm text-zinc-400">
              Latest ledger activity generated from fabrication jobs.
            </p>
          </div>
          <div className="space-y-4">
            {data.recentEntries.length > 0 ? (
              data.recentEntries.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{entry.description}</p>
                      <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                        {entry.sourceType} {entry.reference ? `| ${entry.reference}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-zinc-500">{entry.entryDate.toLocaleString()}</p>
                      <p className="text-xs text-zinc-500">{entry.currency}</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {entry.lines.map((line) => (
                      <div key={line.id} className="grid grid-cols-[1fr_auto_auto] gap-3 text-sm">
                        <span className="text-zinc-300">{line.account.name}</span>
                        <span className="text-zinc-400">
                          {line.debitCents > 0 ? `Dr ${formatMoney(line.debitCents, entry.currency)}` : ""}
                        </span>
                        <span className="text-zinc-400">
                          {line.creditCents > 0 ? `Cr ${formatMoney(line.creditCents, entry.currency)}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-500">No journal entries yet.</p>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

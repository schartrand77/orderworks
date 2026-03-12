import type { Job, Prisma } from "@/generated/prisma/client";
import { AccountType, JournalSourceType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { hasOutstandingBalance } from "@/lib/job-display";

type PrismaClientLike = typeof prisma | Prisma.TransactionClient;

type AccountSeed = {
  code: string;
  name: string;
  type: AccountType;
  description: string;
};

type JournalLineInput = {
  accountId: string;
  description: string;
  debitCents?: number;
  creditCents?: number;
};

type StatementAccount = {
  code: string;
  name: string;
  type: AccountType;
  balanceCents: number;
};

const SYSTEM_ACCOUNTS: AccountSeed[] = [
  {
    code: "1100",
    name: "Cash",
    type: AccountType.ASSET,
    description: "Cash received from paid fabrication jobs.",
  },
  {
    code: "1200",
    name: "Accounts Receivable",
    type: AccountType.ASSET,
    description: "Open customer balances for invoiced jobs.",
  },
  {
    code: "3000",
    name: "Owner Equity",
    type: AccountType.EQUITY,
    description: "Balancing equity account for future manual adjustments.",
  },
  {
    code: "4000",
    name: "Fabrication Revenue",
    type: AccountType.REVENUE,
    description: "Revenue recognized from MakerWorks fabrication jobs.",
  },
];

const SYSTEM_ACCOUNT_CODES = {
  cash: "1100",
  receivables: "1200",
  equity: "3000",
  revenue: "4000",
} as const;

function usesDebitNormalBalance(type: AccountType) {
  return type === AccountType.ASSET || type === AccountType.EXPENSE;
}

function computeAccountBalance(type: AccountType, debitCents: number, creditCents: number) {
  return usesDebitNormalBalance(type) ? debitCents - creditCents : creditCents - debitCents;
}

function zeroCurrencyMap(rows: Array<{ currency: string; amountCents: number }>) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.amountCents);
  }
  return totals;
}

async function ensureSystemAccounts(db: PrismaClientLike) {
  const existing = await db.accountingAccount.findMany({
    where: { code: { in: SYSTEM_ACCOUNTS.map((account) => account.code) } },
    select: { id: true, code: true },
  });
  const existingCodes = new Set(existing.map((account) => account.code));

  for (const account of SYSTEM_ACCOUNTS) {
    if (existingCodes.has(account.code)) {
      continue;
    }
    await db.accountingAccount.create({
      data: {
        code: account.code,
        name: account.name,
        type: account.type,
        description: account.description,
        isSystem: true,
      },
    });
  }

  const accounts = await db.accountingAccount.findMany({
    where: { code: { in: SYSTEM_ACCOUNTS.map((account) => account.code) } },
  });

  return new Map(accounts.map((account) => [account.code, account.id]));
}

async function upsertJournalEntry(
  db: PrismaClientLike,
  input: {
    job: Job;
    sourceType: JournalSourceType;
    description: string;
    entryDate: Date;
    lines: JournalLineInput[];
  },
) {
  await db.journalEntry.upsert({
    where: {
      sourceType_sourceId: {
        sourceType: input.sourceType,
        sourceId: input.job.paymentIntentId,
      },
    },
    create: {
      entryDate: input.entryDate,
      description: input.description,
      sourceType: input.sourceType,
      sourceId: input.job.paymentIntentId,
      reference: input.job.id,
      currency: input.job.currency,
      jobPaymentIntentId: input.job.paymentIntentId,
      lines: {
        create: input.lines.map((line) => ({
          accountId: line.accountId,
          description: line.description,
          debitCents: line.debitCents ?? 0,
          creditCents: line.creditCents ?? 0,
        })),
      },
    },
    update: {
      entryDate: input.entryDate,
      description: input.description,
      reference: input.job.id,
      currency: input.job.currency,
      jobPaymentIntentId: input.job.paymentIntentId,
      lines: {
        deleteMany: {},
        create: input.lines.map((line) => ({
          accountId: line.accountId,
          description: line.description,
          debitCents: line.debitCents ?? 0,
          creditCents: line.creditCents ?? 0,
        })),
      },
    },
  });
}

async function deletePaymentEntry(db: PrismaClientLike, paymentIntentId: string) {
  await db.journalEntry.deleteMany({
    where: {
      sourceType: JournalSourceType.PAYMENT,
      sourceId: paymentIntentId,
    },
  });
}

export async function syncAccountingForJob(job: Job) {
  await prisma.$transaction(async (tx) => {
    const accountIds = await ensureSystemAccounts(tx);
    const receivablesAccountId = accountIds.get(SYSTEM_ACCOUNT_CODES.receivables);
    const cashAccountId = accountIds.get(SYSTEM_ACCOUNT_CODES.cash);
    const revenueAccountId = accountIds.get(SYSTEM_ACCOUNT_CODES.revenue);

    if (!receivablesAccountId || !cashAccountId || !revenueAccountId) {
      throw new Error("Accounting system accounts are missing.");
    }

    await upsertJournalEntry(tx, {
      job,
      sourceType: JournalSourceType.INVOICE,
      description: `Invoice recorded for job ${job.id}`,
      entryDate: job.makerworksCreatedAt,
      lines: [
        {
          accountId: receivablesAccountId,
          description: `Accounts receivable for job ${job.id}`,
          debitCents: job.totalCents,
        },
        {
          accountId: revenueAccountId,
          description: `Revenue for job ${job.id}`,
          creditCents: job.totalCents,
        },
      ],
    });

    if (hasOutstandingBalance(job)) {
      await deletePaymentEntry(tx, job.paymentIntentId);
      return;
    }

    await upsertJournalEntry(tx, {
      job,
      sourceType: JournalSourceType.PAYMENT,
      description: `Payment received for job ${job.id}`,
      entryDate: job.fulfilledAt ?? job.makerworksUpdatedAt ?? job.makerworksCreatedAt,
      lines: [
        {
          accountId: cashAccountId,
          description: `Cash received for job ${job.id}`,
          debitCents: job.totalCents,
        },
        {
          accountId: receivablesAccountId,
          description: `Receivable cleared for job ${job.id}`,
          creditCents: job.totalCents,
        },
      ],
    });
  });
}

export async function syncAccountingForJobs(jobs: Job[]) {
  for (const job of jobs) {
    await syncAccountingForJob(job);
  }
}

export async function syncAllAccountingFromJobs() {
  const jobs = await prisma.job.findMany({
    orderBy: { makerworksCreatedAt: "asc" },
  });
  await syncAccountingForJobs(jobs);
  return jobs.length;
}

function mapValuesToObject(values: Map<string, number>) {
  return Object.fromEntries(
    Array.from(values.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amountCents]) => [currency, amountCents]),
  );
}

export async function getAccountingDashboardData() {
  const [accounts, journalEntries] = await Promise.all([
    prisma.accountingAccount.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }],
      include: {
        lines: {
          include: {
            journalEntry: {
              select: {
                currency: true,
              },
            },
          },
        },
      },
    }),
    prisma.journalEntry.findMany({
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      take: 12,
      include: {
        lines: {
          include: {
            account: true,
          },
        },
        job: {
          select: {
            id: true,
            paymentIntentId: true,
          },
        },
      },
    }),
  ]);

  const accountsByCurrency = new Map<string, StatementAccount[]>();
  const receivables = new Map<string, number>();
  const cash = new Map<string, number>();
  const revenue = new Map<string, number>();
  const expenses = new Map<string, number>();

  for (const account of accounts) {
    const debitByCurrency = new Map<string, number>();
    const creditByCurrency = new Map<string, number>();
    for (const line of account.lines) {
      const currency = line.journalEntry.currency;
      debitByCurrency.set(currency, (debitByCurrency.get(currency) ?? 0) + line.debitCents);
      creditByCurrency.set(currency, (creditByCurrency.get(currency) ?? 0) + line.creditCents);
    }

    for (const currency of new Set([...debitByCurrency.keys(), ...creditByCurrency.keys()])) {
      const balanceCents = computeAccountBalance(
        account.type,
        debitByCurrency.get(currency) ?? 0,
        creditByCurrency.get(currency) ?? 0,
      );
      const list = accountsByCurrency.get(currency) ?? [];
      list.push({
        code: account.code,
        name: account.name,
        type: account.type,
        balanceCents,
      });
      accountsByCurrency.set(currency, list);

      if (account.code === SYSTEM_ACCOUNT_CODES.receivables) {
        receivables.set(currency, balanceCents);
      }
      if (account.code === SYSTEM_ACCOUNT_CODES.cash) {
        cash.set(currency, balanceCents);
      }
      if (account.type === AccountType.REVENUE) {
        revenue.set(currency, (revenue.get(currency) ?? 0) + balanceCents);
      }
      if (account.type === AccountType.EXPENSE) {
        expenses.set(currency, (expenses.get(currency) ?? 0) + balanceCents);
      }
    }
  }

  const balanceSheet = Array.from(accountsByCurrency.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, entries]) => {
      const assets = entries.filter((entry) => entry.type === AccountType.ASSET);
      const liabilities = entries.filter((entry) => entry.type === AccountType.LIABILITY);
      const equity = entries.filter((entry) => entry.type === AccountType.EQUITY);
      const revenueAccounts = entries.filter((entry) => entry.type === AccountType.REVENUE);
      const expenseAccounts = entries.filter((entry) => entry.type === AccountType.EXPENSE);
      const currentEarningsCents =
        revenueAccounts.reduce((sum, entry) => sum + entry.balanceCents, 0) -
        expenseAccounts.reduce((sum, entry) => sum + entry.balanceCents, 0);

      return {
        currency,
        assets,
        liabilities,
        equity,
        currentEarningsCents,
        totalAssetsCents: assets.reduce((sum, entry) => sum + entry.balanceCents, 0),
        totalLiabilitiesCents: liabilities.reduce((sum, entry) => sum + entry.balanceCents, 0),
        totalEquityCents: equity.reduce((sum, entry) => sum + entry.balanceCents, 0) + currentEarningsCents,
      };
    });

  const incomeStatement = Array.from(accountsByCurrency.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, entries]) => {
      const revenueAccounts = entries.filter((entry) => entry.type === AccountType.REVENUE);
      const expenseAccounts = entries.filter((entry) => entry.type === AccountType.EXPENSE);
      const revenueCents = revenueAccounts.reduce((sum, entry) => sum + entry.balanceCents, 0);
      const expenseCents = expenseAccounts.reduce((sum, entry) => sum + entry.balanceCents, 0);

      return {
        currency,
        revenueAccounts,
        expenseAccounts,
        revenueCents,
        expenseCents,
        netIncomeCents: revenueCents - expenseCents,
      };
    });

  return {
    metrics: {
      receivablesByCurrency: mapValuesToObject(receivables),
      cashByCurrency: mapValuesToObject(cash),
      revenueByCurrency: mapValuesToObject(revenue),
      expensesByCurrency: mapValuesToObject(expenses),
      netIncomeByCurrency: mapValuesToObject(
        zeroCurrencyMap(
          Array.from(new Set([...revenue.keys(), ...expenses.keys()])).map((currency) => ({
            currency,
            amountCents: (revenue.get(currency) ?? 0) - (expenses.get(currency) ?? 0),
          })),
        ),
      ),
    },
    balanceSheet,
    incomeStatement,
    recentEntries: journalEntries,
  };
}

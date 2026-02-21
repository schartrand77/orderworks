import { NextRequest, NextResponse } from "next/server";
import { withAdminApiAuth } from "@/lib/auth";
import { parseJobFilters } from "@/lib/job-query";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv-utils";

export async function GET(request: NextRequest) {
  return withAdminApiAuth(request, async () => {
    const filters = parseJobFilters(request.nextUrl.searchParams);
    const rows = await prisma.job.findMany({
      where: {
        ...(filters.statuses.length > 0 ? { status: { in: filters.statuses } } : {}),
        ...(filters.createdFrom || filters.createdTo
          ? {
              makerworksCreatedAt: {
                ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
                ...(filters.createdTo ? { lte: filters.createdTo } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ queuePosition: "asc" }, { id: "asc" }],
      take: 5000,
    });

    const headers = [
      "paymentIntentId",
      "id",
      "status",
      "fulfillmentStatus",
      "queuePosition",
      "totalCents",
      "currency",
      "customerEmail",
      "paymentStatus",
      "paymentMethod",
      "makerworksCreatedAt",
      "notes",
      "viewedAt",
      "invoiceSendCount",
      "receiptSendCount",
    ];

    const csv = toCsv(
      rows.map((job) => ({
        paymentIntentId: job.paymentIntentId,
        id: job.id,
        status: String(job.status).toLowerCase(),
        fulfillmentStatus: String(job.fulfillmentStatus).toLowerCase(),
        queuePosition: job.queuePosition,
        totalCents: job.totalCents,
        currency: job.currency,
        customerEmail: job.customerEmail ?? "",
        paymentStatus: job.paymentStatus ?? "",
        paymentMethod: job.paymentMethod ?? "",
        makerworksCreatedAt: job.makerworksCreatedAt.toISOString(),
        notes: job.notes ?? "",
        viewedAt: job.viewedAt ? job.viewedAt.toISOString() : "",
        invoiceSendCount: job.invoiceSendCount,
        receiptSendCount: job.receiptSendCount,
      })),
      headers,
    );

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="orderworks-jobs-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  });
}

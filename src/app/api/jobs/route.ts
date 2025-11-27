import { NextRequest, NextResponse } from "next/server";
import { ensureAdminApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseJobFilters } from "@/lib/job-query";

export async function GET(request: NextRequest) {
  const unauthorized = ensureAdminApiAuth(request);
  if (unauthorized) {
    return unauthorized;
  }
  try {
    const filters = parseJobFilters(request.nextUrl.searchParams);

    const jobs = await prisma.job.findMany({
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
      orderBy: { makerworksCreatedAt: "desc" },
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

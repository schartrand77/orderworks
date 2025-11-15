import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Params {
  paymentIntentId: string;
}

export async function GET(_request: NextRequest, context: { params: Params }) {
  const { paymentIntentId } = context.params;

  const job = await prisma.job.findUnique({
    where: { paymentIntentId },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}

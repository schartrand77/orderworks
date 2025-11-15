import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { JobStatus } from "@/generated/prisma/enums";
import { completeJobSchema, normalizeCompletionPayload } from "@/lib/validation";

interface Params {
  paymentIntentId: string;
}

export async function POST(request: NextRequest, context: { params: Promise<Params> }) {
  const { paymentIntentId } = await context.params;

  const job = await prisma.job.findUnique({ where: { paymentIntentId } });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = completeJobSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 });
  }

  const data = normalizeCompletionPayload(parsed.data);

  const updated = await prisma.job.update({
    where: { paymentIntentId },
    data: {
      status: JobStatus.DONE,
      ...(data.invoiceUrl !== undefined ? { invoiceUrl: data.invoiceUrl } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    },
  });

  return NextResponse.json({ job: updated });
}

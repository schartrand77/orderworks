import { NextRequest, NextResponse } from "next/server";
import { syncMakerWorksJobs } from "@/lib/makerworks-sync";

async function respondToLegacyWebhook() {
  await syncMakerWorksJobs(true);
  return NextResponse.json({
    ok: true,
    message:
      "MakerWorks webhooks are no longer required—OrderWorks now syncs directly from the MakerWorks database. Remove the webhook in MakerWorks to silence this notice.",
  });
}

export async function POST(_request: NextRequest) {
  return respondToLegacyWebhook();
}

export async function GET(_request: NextRequest) {
  return respondToLegacyWebhook();
}

export async function HEAD() {
  await syncMakerWorksJobs(true);
  return new NextResponse(null, { status: 200 });
}

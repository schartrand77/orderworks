import { NextRequest, NextResponse } from "next/server";
import { withAdminApiAuth } from "@/lib/auth";
import { fetchMakerWorksStatus, CONNECTED_THRESHOLD_MINUTES } from "@/lib/makerworks-status";
import type { MakerWorksStatusPayload } from "@/types/makerworks-status";

export const dynamic = "force-dynamic";

function buildResponse(data: MakerWorksStatusPayload, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export async function GET(request: NextRequest) {
  return withAdminApiAuth(request, async () => {
    try {
      const payload = await fetchMakerWorksStatus();
      return buildResponse(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return buildResponse(
        {
          connected: false,
          status: "error",
          lastJobReceivedAt: null,
          thresholdMinutes: CONNECTED_THRESHOLD_MINUTES,
          error: message,
        },
        { status: 500 },
      );
    }
  });
}

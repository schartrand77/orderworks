import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "alive",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureAdminApiAuth } from "@/lib/auth";
import { sendTestEmail } from "@/lib/email";

const payloadSchema = z.object({
  to: z.string().email("A valid email address is required."),
});

export async function POST(request: NextRequest) {
  const unauthorized = ensureAdminApiAuth(request);
  if (unauthorized) {
    return unauthorized;
  }
  let parsedBody: z.infer<typeof payloadSchema>;

  try {
    const json = await request.json();
    const parsed = payloadSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 422 },
      );
    }
    parsedBody = parsed.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  try {
    await sendTestEmail(parsedBody.to);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send test email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken,
  isAdminAuthConfigured,
  verifyAdminCredentials,
} from "@/lib/auth";

interface LoginPayload {
  username?: unknown;
  password?: unknown;
}

function isSecureRequest(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    const proto = forwardedProto.split(",")[0]?.trim().toLowerCase();
    if (proto) {
      return proto === "https";
    }
  }
  return request.nextUrl.protocol === "https:";
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthConfigured()) {
    return NextResponse.json(
      { error: "Admin login is not configured on this deployment." },
      { status: 500 },
    );
  }

  let payload: LoginPayload;
  try {
    payload = (await request.json()) as LoginPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  const password = typeof payload.password === "string" ? payload.password.trim() : "";

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required." },
      { status: 422 },
    );
  }

  if (!verifyAdminCredentials(username, password)) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: createAdminSessionToken(),
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
  });

  return response;
}

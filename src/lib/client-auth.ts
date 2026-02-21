"use client";

const ADMIN_CSRF_COOKIE = "orderworks_admin_csrf";
const ADMIN_CSRF_HEADER = "x-csrf-token";

export function handleUnauthorizedResponse(status: number) {
  if (status === 401) {
    window.location.href = "/login";
    return true;
  }
  return false;
}

export function buildCsrfHeaders(headers?: HeadersInit) {
  const nextHeaders = new Headers(headers);
  const cookieValue = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_CSRF_COOKIE}=`))
    ?.slice(ADMIN_CSRF_COOKIE.length + 1);

  if (cookieValue && !nextHeaders.has(ADMIN_CSRF_HEADER)) {
    try {
      nextHeaders.set(ADMIN_CSRF_HEADER, decodeURIComponent(cookieValue));
    } catch {
      nextHeaders.set(ADMIN_CSRF_HEADER, cookieValue);
    }
  }

  return nextHeaders;
}

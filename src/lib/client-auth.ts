"use client";

export function handleUnauthorizedResponse(status: number) {
  if (status === 401) {
    window.location.href = "/login";
    return true;
  }
  return false;
}

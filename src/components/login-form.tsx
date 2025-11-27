"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  returnTo?: string;
}

export function LoginForm({ returnTo = "/" }: Props) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Unable to log in. Please try again.");
        return;
      }

      router.push(returnTo || "/");
      router.refresh();
    } catch {
      setError("Unable to log in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-300" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          name="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none ring-emerald-400/50 transition placeholder:text-zinc-500 focus:border-emerald-400/50 focus:ring"
          placeholder="admin"
          autoComplete="username"
          required
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-300" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none ring-emerald-400/50 transition placeholder:text-zinc-500 focus:border-emerald-400/50 focus:ring"
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
      </div>
      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-60"
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
      <p className="text-center text-xs text-zinc-500">
        Forgot your credentials? Update the ADMIN_USERNAME and ADMIN_PASSWORD environment variables.
      </p>
    </form>
  );
}

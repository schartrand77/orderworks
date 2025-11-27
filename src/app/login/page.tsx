import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { readAdminSessionTokenFromHeaders, validateAdminSessionToken } from "@/lib/auth";

interface SearchParams {
  [key: string]: string | string[] | undefined;
  returnTo?: string | string[];
}

function resolveReturnTo(params?: SearchParams) {
  const value = params?.returnTo;
  const stringValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  if (stringValue && stringValue.startsWith("/")) {
    return stringValue;
  }
  return "/";
}

export default async function LoginPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const token = await readAdminSessionTokenFromHeaders();
  if (validateAdminSessionToken(token)) {
    redirect("/");
  }

  const params = searchParams ? await searchParams : undefined;
  const returnTo = resolveReturnTo(params);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 py-10 text-white">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-white/10 bg-[#0a0a0a]/90 p-8 shadow-[0_30px_70px_rgba(0,0,0,0.7)]">
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">OrderWorks</p>
          <h1 className="text-2xl font-semibold text-white">Admin login</h1>
          <p className="text-sm text-zinc-400">Sign in with the admin credentials configured in your environment.</p>
        </div>
        <LoginForm returnTo={returnTo} />
      </div>
    </main>
  );
}

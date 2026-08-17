import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { getCurrentUserContext } from "@/lib/auth/context";
import { getDefaultRouteForRole } from "@/lib/domain/roles";
import { signUpCustomerWithPassword } from "./actions";

type RegisterPageProps = {
  searchParams?: {
    error?: string;
  };
};

const errorMessages: Record<string, string> = {
  invalid_input: "Revisa nombre, email y password.",
  register_failed: "No se pudo crear la cuenta.",
  organization_missing: "No hay una organizacion activa para registrar clientes.",
  supabase_not_configured: "Falta configurar Supabase en .env.local."
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const context = await getCurrentUserContext();

  if (context.user) {
    redirect(getDefaultRouteForRole(context.role));
  }

  const error = searchParams?.error ? errorMessages[searchParams.error] : null;

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--bg)] px-5 py-10">
      <section className="w-full max-w-md border border-[var(--line)] bg-white p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">
          Corte SaaS
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Crear cuenta</h1>

        {error ? (
          <div className="mt-4 border-l-4 border-[var(--danger)] bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </div>
        ) : null}

        <form action={signUpCustomerWithPassword} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Nombre
            <input
              name="fullName"
              required
              className="focus-ring mt-2 w-full border border-[var(--line)] px-3 py-2"
              autoComplete="name"
            />
          </label>
          <label className="block text-sm font-medium">
            Email
            <input
              name="email"
              type="email"
              required
              className="focus-ring mt-2 w-full border border-[var(--line)] px-3 py-2"
              autoComplete="email"
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="focus-ring mt-2 w-full border border-[var(--line)] px-3 py-2"
              autoComplete="new-password"
            />
          </label>
          <PendingSubmitButton
            pendingLabel="Creando cuenta..."
            className="focus-ring w-full bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--ink)]"
          >
            Registrarme
          </PendingSubmitButton>
        </form>

        <a className="mt-4 block text-sm font-semibold text-[var(--teal)]" href="/login">
          Ya tengo cuenta
        </a>
      </section>
    </main>
  );
}

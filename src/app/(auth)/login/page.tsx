import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { getCurrentUserContext } from "@/lib/auth/context";
import { getDefaultRouteForRole } from "@/lib/domain/roles";
import { signInWithPassword } from "./actions";

type LoginPageProps = {
  searchParams?: {
    error?: string;
    notice?: string;
  };
};

const errorMessages: Record<string, string> = {
  invalid_input: "Revisa email y password.",
  invalid_credentials: "Credenciales invalidas.",
  supabase_not_configured: "Falta configurar Supabase en .env.local."
};

const noticeMessages: Record<string, string> = {
  registered: "Cuenta creada. Ya podes ingresar."
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const context = await getCurrentUserContext();

  if (context.user) {
    redirect(getDefaultRouteForRole(context.role));
  }

  const error = searchParams?.error ? errorMessages[searchParams.error] : null;
  const notice = searchParams?.notice ? noticeMessages[searchParams.notice] : null;

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--bg)] px-5 py-10">
      <section className="w-full max-w-md border border-[var(--line)] bg-white p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">
          Corte SaaS
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Ingresar</h1>

        {error ? (
          <div className="mt-4 border-l-4 border-[var(--danger)] bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="mt-4 border-l-4 border-[var(--teal)] bg-white px-3 py-2 text-sm text-[var(--ink)]">
            {notice}
          </div>
        ) : null}

        {!context.supabaseConfigured ? (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Configura Supabase para iniciar sesion con usuarios reales.
          </p>
        ) : null}

        <form action={signInWithPassword} className="mt-6 space-y-4">
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
              className="focus-ring mt-2 w-full border border-[var(--line)] px-3 py-2"
              autoComplete="current-password"
            />
          </label>
          <PendingSubmitButton
            pendingLabel="Ingresando..."
            className="focus-ring w-full bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--ink)]"
          >
            Ingresar
          </PendingSubmitButton>
        </form>

        <a className="mt-4 block text-sm font-semibold text-[var(--teal)]" href="/register">
          Crear cuenta de cliente
        </a>
      </section>
    </main>
  );
}

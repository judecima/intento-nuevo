export function ConfigRequired() {
  return (
    <section className="max-w-3xl border border-[var(--line)] bg-white p-5">
      <h1 className="text-2xl font-semibold tracking-tight">Configurar Supabase</h1>
      <p className="mt-3 text-sm text-[var(--muted)]">
        Defini `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
        en `.env.local` para habilitar autenticacion y datos multi-tenant.
      </p>
    </section>
  );
}

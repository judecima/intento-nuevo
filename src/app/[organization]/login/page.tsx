/* eslint-disable @next/next/no-img-element -- logo URL is tenant-configured and may be external. */
import { notFound, redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { getCurrentUserContext } from "@/lib/auth/context";
import { getPublicOrganization, organizationAccessNotices } from "@/lib/organizations/public-access";
import { signInForOrganization } from "@/app/(auth)/login/actions";

type Props = { params: { organization: string }; searchParams?: { error?: string } };

export default async function OrganizationLoginPage({ params, searchParams }: Props) {
  const organization = await getPublicOrganization(params.organization).catch(() => null);
  if (!organization) notFound();
  const context = await getCurrentUserContext();
  if (context.user && (context.isPlatformAdmin || context.memberships.some((item) => item.organizationId === organization.id))) redirect("/dashboard");
  const error = searchParams?.error ? (organizationAccessNotices[searchParams.error] ?? "No se pudo iniciar sesión.") : null;
  const brandStyle = { "--brand-primary": organization.primaryColor, "--brand-secondary": organization.secondaryColor } as React.CSSProperties;

  return (
    <main style={brandStyle} className="grid min-h-screen place-items-center bg-[var(--bg)] px-5 py-10">
      <section className="w-full max-w-md border border-[var(--line)] bg-white p-6">
        {organization.logoUrl ? <img src={organization.logoUrl} alt={`Logo de ${organization.name}`} className="mb-4 h-12 max-w-[220px] object-contain object-left" /> : null}
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">{organization.name}</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Ingresar</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Acceso exclusivo para usuarios de esta organización.</p>
        {error ? <div className="mt-4 border-l-4 border-[var(--danger)] bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div> : null}
        <form action={signInForOrganization} className="mt-6 space-y-4">
          <input type="hidden" name="organizationSlug" value={organization.slug} />
          <label className="block text-sm font-medium">Email<input name="email" type="email" required className="focus-ring mt-2 w-full border border-[var(--line)] px-3 py-2" autoComplete="email" /></label>
          <label className="block text-sm font-medium">Password<input name="password" type="password" required className="focus-ring mt-2 w-full border border-[var(--line)] px-3 py-2" autoComplete="current-password" /></label>
          <PendingSubmitButton pendingLabel="Validando organización..." className="focus-ring w-full bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--ink)]">Ingresar</PendingSubmitButton>
        </form>
        {organization.allowCustomerSignup ? <a className="mt-4 block text-sm font-semibold text-[var(--teal)]" href={`/${organization.slug}/register`}>Crear cuenta de cliente</a> : null}
      </section>
    </main>
  );
}

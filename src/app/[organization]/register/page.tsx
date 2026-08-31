/* eslint-disable @next/next/no-img-element -- logo URL is tenant-configured and may be external. */
import { notFound, redirect } from "next/navigation";
import { BrandAuthShell } from "@/components/auth/brand-auth-shell";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { PasswordConfirmationFields } from "@/components/forms/password-field";
import { NoticeAlert } from "@/components/ui/material";
import { getCurrentUserContext } from "@/lib/auth/context";
import { getPublicOrganization, organizationAccessNotices } from "@/lib/organizations/public-access";
import { organizationPath } from "@/lib/routing/routes";
import { signUpCustomerForOrganization } from "@/app/(auth)/register/actions";

type Props = { params: { organization: string }; searchParams?: { error?: string } };

export default async function OrganizationRegisterPage({ params, searchParams }: Props) {
  const organization = await getPublicOrganization(params.organization).catch(() => null);
  if (!organization) notFound();
  if (!organization.allowCustomerSignup) redirect(`/${organization.slug}/login?error=signup_disabled`);

  const context = await getCurrentUserContext(organization.slug);
  const membership = context.memberships.find((item) => item.organizationId === organization.id) ?? null;
  if (context.user && membership) redirect(organizationPath(organization.slug, "/dashboard"));

  const error = searchParams?.error
    ? organizationAccessNotices[searchParams.error] ?? "No se pudo crear la cuenta."
    : null;
  const brand = {
    name: organization.name,
    primaryColor: organization.primaryColor,
    secondaryColor: organization.secondaryColor,
    logoUrl: organization.logoUrl
  };

  return (
    <BrandAuthShell
      brand={brand}
      eyebrow="Alta de cliente"
      title="Crear cuenta"
      description="Tu cuenta quedara asociada a esta organizacion."
    >
      {error ? <NoticeAlert className="mb-4">{error}</NoticeAlert> : null}
      <form action={signUpCustomerForOrganization} className="space-y-4">
        <input type="hidden" name="organizationSlug" value={organization.slug} />
        <label className="block">
          <span className="field-label">Nombre</span>
          <input name="fullName" required minLength={2} className="input focus-ring mt-2" autoComplete="name" />
        </label>
        <label className="block">
          <span className="field-label">Email</span>
          <input name="email" type="email" required className="input focus-ring mt-2" autoComplete="email" />
        </label>
        <PasswordConfirmationFields />
        <PendingSubmitButton pendingLabel="Creando cuenta..." className="btn btn-accent focus-ring w-full">
          Registrarme
        </PendingSubmitButton>
      </form>
      <a className="mt-4 block text-sm font-semibold text-[var(--teal)]" href={`/${organization.slug}/login`}>
        Ya tengo cuenta
      </a>
    </BrandAuthShell>
  );
}

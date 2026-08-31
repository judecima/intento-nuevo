/* eslint-disable @next/next/no-img-element -- logo URL is tenant-configured and may be external. */
import { notFound, redirect } from "next/navigation";
import { BrandAuthShell } from "@/components/auth/brand-auth-shell";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { PasswordField } from "@/components/forms/password-field";
import { NoticeAlert } from "@/components/ui/material";
import { getCurrentUserContext } from "@/lib/auth/context";
import { getPublicPlatformBranding } from "@/lib/branding/public";
import { getDefaultRouteForRole } from "@/lib/domain/roles";
import { getPublicOrganization, organizationAccessNotices } from "@/lib/organizations/public-access";
import { organizationPath, PLATFORM_SLUG, platformPath } from "@/lib/routing/routes";
import { signInForOrganization, signInForPlatform } from "@/app/(auth)/login/actions";

type Props = { params: { organization: string }; searchParams?: { error?: string } };

const platformErrorMessages: Record<string, string> = {
  invalid_input: "Revisa email y password.",
  invalid_credentials: "Credenciales invalidas.",
  not_platform_admin: "No tenes permisos para administrar esta plataforma.",
  supabase_not_configured: "Falta configurar Supabase en .env.local."
};

export default async function OrganizationLoginPage({ params, searchParams }: Props) {
  if (params.organization.toLowerCase() === PLATFORM_SLUG) {
    return <PlatformLoginPage searchParams={searchParams} />;
  }

  const organization = await getPublicOrganization(params.organization).catch(() => null);
  if (!organization) notFound();

  const context = await getCurrentUserContext(organization.slug);
  const membership = context.memberships.find((item) => item.organizationId === organization.id) ?? null;
  if (context.user && membership) {
    redirect(organizationPath(organization.slug, getDefaultRouteForRole(membership.role)));
  }

  const error = searchParams?.error
    ? organizationAccessNotices[searchParams.error] ?? "No se pudo iniciar sesion."
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
      eyebrow="Portal de organizacion"
      title="Ingresar"
      description="Acceso exclusivo para usuarios de esta organizacion."
    >
      {error ? <NoticeAlert className="mb-4">{error}</NoticeAlert> : null}
      <form action={signInForOrganization} className="space-y-4">
        <input type="hidden" name="organizationSlug" value={organization.slug} />
        <label className="block">
          <span className="field-label">Email</span>
          <input name="email" type="email" required className="input focus-ring mt-2" autoComplete="email" />
        </label>
        <PasswordField name="password" label="Password" autoComplete="current-password" />
        <PendingSubmitButton pendingLabel="Validando organizacion..." className="btn btn-accent focus-ring w-full">
          Ingresar
        </PendingSubmitButton>
      </form>
      {organization.allowCustomerSignup ? (
        <a className="mt-4 block text-sm font-semibold text-[var(--teal)]" href={`/${organization.slug}/register`}>
          Crear cuenta de cliente
        </a>
      ) : null}
    </BrandAuthShell>
  );
}

async function PlatformLoginPage({ searchParams }: { searchParams?: { error?: string } }) {
  const branding = await getPublicPlatformBranding();
  const context = await getCurrentUserContext(PLATFORM_SLUG);
  if (context.user && context.isPlatformAdmin) redirect(platformPath("/dashboard"));

  const error = searchParams?.error
    ? platformErrorMessages[searchParams.error] ?? "No se pudo iniciar sesion."
    : null;

  return (
    <BrandAuthShell
      brand={branding}
      eyebrow="Administracion SaaS"
      title="Ingresar"
      description="Administracion global de organizaciones, usuarios y configuracion de plataforma."
    >
      {error ? <NoticeAlert className="mb-4">{error}</NoticeAlert> : null}
      <form action={signInForPlatform} className="space-y-4">
        <label className="block">
          <span className="field-label">Email</span>
          <input name="email" type="email" required className="input focus-ring mt-2" autoComplete="email" />
        </label>
        <PasswordField name="password" label="Password" autoComplete="current-password" />
        <PendingSubmitButton pendingLabel="Ingresando..." className="btn btn-accent focus-ring w-full">
          Ingresar
        </PendingSubmitButton>
      </form>
    </BrandAuthShell>
  );
}

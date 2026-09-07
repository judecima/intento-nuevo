import Link from "next/link";
import { OrganizationBrandingForm } from "@/components/admin/organization-branding-form";
import { PlatformBrandingForm } from "@/components/admin/platform-branding-form";
import { getCurrentUserContext } from "@/lib/auth/context";
import { canAdminister } from "@/lib/domain/admin";
import { canManagePlatform, DEFAULT_ORGANIZATION_DELIVERY_TIME_DAYS } from "@/lib/domain/platform";
import { toScopedPath } from "@/lib/routing/routes";

type Props = { searchParams?: { notice?: string } };

export default async function AdminSettingsPage({ searchParams }: Props) {
  const context = await getCurrentUserContext();
  const basePath = context.routeBasePath;

  if (canManagePlatform(context)) {
    const notice = searchParams?.notice ? noticeMessages[searchParams.notice] : null;
    return (
      <section className="mx-auto max-w-[900px] space-y-5">
        <header>
          <div className="eyebrow">Plataforma</div>
          <h1 className="mt-1.5 text-[30px] font-semibold tracking-[-0.02em]">Configuracion</h1>
          <p className="hint mt-2">
            {context.platformBranding.legalName} configura la identidad visual global y la de cada organizacion.
          </p>
        </header>
        <section className="card p-5">
          <h2 className="text-[19px] font-semibold">Identidad global del SaaS</h2>
          <p className="hint mt-2">Esta identidad se usa cuando no hay un tenant activo y funciona como valor por defecto.</p>
          <div className="mt-4">
            <PlatformBrandingForm {...context.platformBranding} />
          </div>
          {notice ? <div className="operation-banner mt-4">{notice}</div> : null}
          <div className="mt-6 border-t border-[var(--line)] pt-5">
            <h2 className="text-[19px] font-semibold">Configuracion por organizacion</h2>
            <p className="hint mt-2">Selecciona una organizacion en el ABM para editar sus colores, logo y tiempo de entrega.</p>
          </div>
          <Link href={toScopedPath(basePath, "/admin/organizations")} className="btn btn-primary focus-ring mt-4 inline-flex">
            Ir a organizaciones
          </Link>
        </section>
      </section>
    );
  }

  if (!context.activeOrganization || !canAdminister(context.role)) {
    return (
      <section className="mx-auto max-w-[900px] space-y-4">
        <header>
          <div className="eyebrow">Administrador</div>
          <h1 className="mt-1.5 text-[30px] font-semibold tracking-[-0.02em]">Configuracion</h1>
        </header>
        <div className="card p-5 text-sm text-[var(--muted)]">
          Tu usuario no tiene permisos para editar la configuracion de esta organizacion.
        </div>
      </section>
    );
  }

  const notice = searchParams?.notice ? noticeMessages[searchParams.notice] : null;
  return (
    <section className="mx-auto max-w-[900px] space-y-5">
      <header>
        <div className="eyebrow">Administrador</div>
        <h1 className="mt-1.5 text-[30px] font-semibold tracking-[-0.02em]">Configuracion</h1>
        <p className="hint mt-2">Personaliza la configuracion de {context.activeOrganization.name}.</p>
      </header>
      {notice ? <div className="operation-banner">{notice}</div> : null}
      <section className="card">
        <div className="card-head">
          <div>
            <div className="eyebrow-muted">Organizacion</div>
            <h2 className="mt-1 text-[19px] font-semibold">Configuracion e identidad visual</h2>
          </div>
        </div>
        <div className="p-4">
          <OrganizationBrandingForm
            organizationId={context.activeOrganization.id}
            primaryColor={context.activeOrganization.primary_color}
            secondaryColor={context.activeOrganization.secondary_color}
            deliveryTimeDays={context.activeOrganization.delivery_time_days ?? DEFAULT_ORGANIZATION_DELIVERY_TIME_DAYS}
            logoUrl={context.activeOrganization.logo_url}
          />
        </div>
      </section>
    </section>
  );
}

const noticeMessages: Record<string, string> = {
  branding_saved: "Configuracion de organizacion guardada.",
  branding_invalid: "Los colores, la organizacion o el tiempo de entrega no son validos.",
  branding_file_invalid: "El logo debe ser PNG, JPG, WEBP o SVG y pesar como maximo 2 MB.",
  branding_save_failed: "No se pudo guardar la configuracion de organizacion.",
  platform_branding_saved: "Identidad global guardada.",
  platform_branding_invalid: "Los datos de identidad global no son validos.",
  platform_branding_migration_required: "Falta aplicar la migracion de identidad global en Supabase.",
  platform_branding_save_failed: "No se pudo cargar el logo global.",
  platform_branding_name_invalid: "La razon social del SaaS debe tener entre 2 y 160 caracteres.",
  branding_forbidden: "No tenes permisos para modificar esta organizacion."
};

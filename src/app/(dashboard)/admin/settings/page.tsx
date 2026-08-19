import { SectionPlaceholder } from "@/components/layout/section-placeholder";
import { OrganizationBrandingForm } from "@/components/admin/organization-branding-form";
import { PlatformBrandingForm } from "@/components/admin/platform-branding-form";
import { getCurrentUserContext } from "@/lib/auth/context";
import { canAdminister } from "@/lib/domain/admin";
import Link from "next/link";

type Props = { searchParams?: { notice?: string } };

export default async function AdminSettingsPage({ searchParams }: Props) {
  const context = await getCurrentUserContext();
  if (context.isPlatformAdmin) {
    const notice = searchParams?.notice ? noticeMessages[searchParams.notice] : null;
    return (
      <section className="mx-auto max-w-[900px] space-y-5">
        <header>
          <div className="eyebrow">Plataforma</div>
          <h1 className="mt-1.5 text-[30px] font-semibold tracking-[-0.02em]">Configuración</h1>
          <p className="hint mt-2">El superusuario configura la identidad visual dentro de cada organización.</p>
        </header>
        <section className="card p-5">
          <h2 className="text-[19px] font-semibold">Identidad global del SaaS</h2>
          <p className="hint mt-2">Esta identidad se usa cuando no hay un tenant activo y funciona como valor por defecto.</p>
          <div className="mt-4">
            <PlatformBrandingForm {...context.platformBranding} />
          </div>
          {notice ? <div className="operation-banner mt-4">{notice}</div> : null}
          <div className="mt-6 border-t border-[var(--line)] pt-5">
            <h2 className="text-[19px] font-semibold">Branding por organización</h2>
            <p className="hint mt-2">Seleccioná una organización en el ABM para editar sus colores y logo.</p>
          </div>
          <Link href="/admin/organizations" className="btn btn-primary focus-ring mt-4 inline-flex">
            Ir a organizaciones
          </Link>
        </section>
      </section>
    );
  }
  if (!context.activeOrganization || !canAdminister(context.role)) {
    return <SectionPlaceholder title="Configuracion" eyebrow="Administrador" />;
  }
  const notice = searchParams?.notice ? noticeMessages[searchParams.notice] : null;
  return (
    <section className="mx-auto max-w-[900px] space-y-5">
      <header>
        <div className="eyebrow">Administrador</div>
        <h1 className="mt-1.5 text-[30px] font-semibold tracking-[-0.02em]">Configuración</h1>
        <p className="hint mt-2">Personalizá la identidad visual de {context.activeOrganization.name}.</p>
      </header>
      {notice ? <div className="operation-banner">{notice}</div> : null}
      <section className="card">
        <div className="card-head">
          <div>
            <div className="eyebrow-muted">Marca</div>
            <h2 className="mt-1 text-[19px] font-semibold">Colores y logo</h2>
          </div>
        </div>
        <div className="p-4">
          <OrganizationBrandingForm
            organizationId={context.activeOrganization.id}
            primaryColor={context.activeOrganization.primary_color}
            secondaryColor={context.activeOrganization.secondary_color}
            logoUrl={context.activeOrganization.logo_url}
          />
        </div>
      </section>
    </section>
  );
}

const noticeMessages: Record<string, string> = {
  branding_saved: "Identidad visual guardada.",
  branding_invalid: "Los colores o la organización no son válidos.",
  branding_file_invalid: "El logo debe ser PNG, JPG, WEBP o SVG y pesar como máximo 2 MB.",
  branding_save_failed: "No se pudo guardar la identidad visual.",
  platform_branding_migration_required: "Falta aplicar la migracion de identidad global en Supabase.",
  platform_branding_save_failed: "No se pudo cargar el logo global.",
  platform_branding_name_invalid: "La razon social del SaaS debe tener entre 2 y 160 caracteres.",
  branding_forbidden: "No tenés permisos para modificar esta organización."
};

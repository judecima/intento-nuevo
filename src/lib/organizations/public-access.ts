import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DEFAULT_ORGANIZATION_NAME,
  normalizeBrandIdentity
} from "@/lib/branding/identity";

export type PublicOrganization = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  allowCustomerSignup: boolean;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
};

/**
 * Datos publicos de la organizacion para su puerta de entrada. Va por RPC
 * `security definer` porque la tabla solo la ven los miembros.
 */
export async function getPublicOrganization(slug: string): Promise<PublicOrganization | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("organization_public_info", { target_slug: slug });

  if (error) {
    throw new Error(`ORGANIZATION_PUBLIC_INFO_FAILED: ${error.message}`);
  }

  const row = (data ?? [])[0];
  if (!row) return null;
  const brand = normalizeBrandIdentity(
    {
      name: row.name,
      primaryColor: row.primary_color,
      secondaryColor: row.secondary_color,
      logoUrl: row.logo_url
    },
    DEFAULT_ORGANIZATION_NAME
  );

  return {
    id: row.id,
    name: brand.name,
    slug: row.slug,
    active: row.active,
    allowCustomerSignup: row.allow_customer_signup,
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
    logoUrl: brand.logoUrl
  };
}

export const organizationAccessNotices: Record<string, string> = {
  invalid_input: "Revisa los datos ingresados.",
  password_mismatch: "Las contrasenas no coinciden.",
  invalid_credentials: "Email o contrasena incorrectos.",
  supabase_not_configured: "Falta configurar Supabase en .env.local.",
  signup_disabled: "Esta organizacion no acepta registro de clientes.",
  signup_failed: "No se pudo crear la cuenta. Proba con otro email.",
  email_taken: "Ese email ya tiene cuenta: entra con tu contrasena.",
  confirm_email: "Cuenta creada. Revisa tu correo para confirmarla y despues entra con tu contrasena.",
  join_failed: "No se pudo asociar la cuenta con esta organizacion.",
  not_member: "Tu cuenta no pertenece a esta organizacion o esta inactiva.",
  tenant_password_required:
    "Esta cuenta usa credenciales globales antiguas. Pedile al administrador que la cree con una clave propia de esta organizacion.",
  organization_not_found: "La organizacion no existe o esta inactiva."
};

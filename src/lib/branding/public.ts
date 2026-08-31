import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, isSupabaseServerConfigured, getPublicEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import {
  DEFAULT_BRAND_NAME,
  normalizeBrandIdentity,
  type BrandIdentity
} from "@/lib/branding/identity";

export const getPublicPlatformBranding = cache(async (): Promise<BrandIdentity> => {
  if (!isSupabaseConfigured()) {
    return defaultPlatformIdentity();
  }

  const rpcBranding = await readPlatformBrandingFromPublicRpc();
  if (rpcBranding) return rpcBranding;

  const adminBranding = await readPlatformBrandingWithAdminClient();
  return adminBranding ?? defaultPlatformIdentity();
});

function defaultPlatformIdentity(): BrandIdentity {
  return normalizeBrandIdentity({}, DEFAULT_BRAND_NAME);
}

async function readPlatformBrandingFromPublicRpc(): Promise<BrandIdentity | null> {
  try {
    const env = getPublicEnv();
    const supabase = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    const { data, error } = await supabase.rpc("platform_public_branding");
    if (error) return null;

    const row = data?.[0];
    if (!row) return null;

    return normalizeBrandIdentity({
      name: row.legal_name,
      primaryColor: row.primary_color,
      secondaryColor: row.secondary_color,
      logoUrl: row.logo_url
    });
  } catch {
    return null;
  }
}

async function readPlatformBrandingWithAdminClient(): Promise<BrandIdentity | null> {
  if (!isSupabaseServerConfigured()) return null;

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("platform_settings")
      .select("legal_name, primary_color, secondary_color, logo_url")
      .eq("id", true)
      .maybeSingle();

    if (error || !data) return null;

    return normalizeBrandIdentity({
      name: data.legal_name,
      primaryColor: data.primary_color,
      secondaryColor: data.secondary_color,
      logoUrl: data.logo_url
    });
  } catch {
    return null;
  }
}

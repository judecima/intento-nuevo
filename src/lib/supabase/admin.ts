import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import type { Database } from "./database.types";

export function createSupabaseAdminClient(): SupabaseClient<Database, "public"> {
  const env = getServerEnv();

  return createClient<Database, "public">(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    },
  ) as unknown as SupabaseClient<Database, "public">;
}

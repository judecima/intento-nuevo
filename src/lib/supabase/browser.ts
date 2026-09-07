"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "./database.types";

export function createSupabaseBrowserClient(): SupabaseClient<Database, "public"> {
  const env = getPublicEnv();

  return createBrowserClient<Database, "public">(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) as unknown as SupabaseClient<Database, "public">;
}

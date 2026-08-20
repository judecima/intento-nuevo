import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { getRouteScopeFromHeaders } from "@/lib/routing/server";
import { platformPath } from "@/lib/routing/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const scope = getRouteScopeFromHeaders();

  if (isSupabaseConfigured()) {
    const supabase = createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  redirect(scope ? `${scope.basePath}/login` : platformPath("/login"));
}

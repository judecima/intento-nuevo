import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/context";
import { AppShell } from "@/components/layout/app-shell";
import { ConfigRequired } from "@/components/layout/config-required";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const context = await getCurrentUserContext();
  const loginPath = context.routeBasePath ? `${context.routeBasePath}/login` : "/";

  if (!context.supabaseConfigured) {
    return (
      <AppShell context={context}>
        <ConfigRequired />
      </AppShell>
    );
  }

  if (!context.user) {
    redirect(loginPath);
  }

  if (!context.routeScope) {
    redirect("/");
  }

  if (context.routeScope.kind === "platform" && !context.isPlatformAdmin) {
    redirect(`${loginPath}?error=not_platform_admin`);
  }

  if (context.routeScope.kind === "organization" && !context.activeOrganization) {
    redirect(`${loginPath}?error=not_member`);
  }

  return <AppShell context={context}>{children}</AppShell>;
}

import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/context";
import { AppShell } from "@/components/layout/app-shell";
import { ConfigRequired } from "@/components/layout/config-required";

export default async function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const context = await getCurrentUserContext();

  if (!context.supabaseConfigured) {
    return (
      <AppShell context={context}>
        <ConfigRequired />
      </AppShell>
    );
  }

  if (!context.user) {
    redirect("/login");
  }

  return <AppShell context={context}>{children}</AppShell>;
}

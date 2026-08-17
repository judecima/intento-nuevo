import { getCurrentUserContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Pagina temporal de diagnostico: muestra que ve el servidor con TU sesion.
 * Solo expone datos de la propia sesion. Borrar cuando termine la revision.
 */
export default async function DiagnosticoPage() {
  const context = await getCurrentUserContext();
  const supabase = createSupabaseServerClient();

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id ?? null;

  const memberships = userId
    ? await supabase
        .from("organization_members")
        .select("organization_id, role, active, organizations(id, name, slug, active)")
        .eq("user_id", userId)
        .eq("active", true)
    : null;

  const platform = userId
    ? await supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle()
    : null;

  const rows: Array<[string, unknown]> = [
    ["URL de Supabase que usa el server", process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(sin definir)"],
    ["auth.getUser() id", userId ?? "(sin sesion)"],
    ["auth.getUser() email", authData.user?.email ?? "-"],
    ["context.isPlatformAdmin", context.isPlatformAdmin],
    ["context.role", context.role ?? "(null)"],
    ["context.activeOrganization", context.activeOrganization?.name ?? "(null)"],
    ["context.memberships", context.memberships.length],
    ["context.loadError", context.loadError ?? "(sin error)"],
    ["consulta membresias: filas", memberships?.data?.length ?? "-"],
    ["consulta membresias: error", memberships?.error?.message ?? "(sin error)"],
    ["consulta platform_admins: fila", platform?.data ? "encontrada" : "no encontrada"],
    ["consulta platform_admins: error", platform?.error?.message ?? "(sin error)"],
    ["consulta platform_admins: codigo", platform?.error?.code ?? "-"]
  ];

  return (
    <main className="mx-auto max-w-[900px] px-6 py-10">
      <h1 className="text-[26px] font-semibold">Diagnostico de sesion</h1>
      <p className="hint mt-2">Pagina temporal. Muestra lo que resuelve el servidor con tu sesion actual.</p>

      <table className="data-table mt-6">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td className="txt w-[320px]">{label}</td>
              <td>{String(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

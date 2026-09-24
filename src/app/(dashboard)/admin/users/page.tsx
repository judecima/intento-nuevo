import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { createOrganizationMemberAction } from "@/lib/admin/actions";
import { listOrganizationMembers } from "@/lib/admin/queries";
import { getCurrentUserContext } from "@/lib/auth/context";
import { adminDomainErrors, canAdminister, staffMemberRoles } from "@/lib/domain/admin";
import { roleLabels } from "@/lib/domain/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Notice } from "@/components/ui/notice";

type AdminUsersPageProps = {
  searchParams?: {
    notice?: string | string[];
  };
};

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const context = await getCurrentUserContext();
  const organizationId = context.activeOrganization?.id;
  const notice = noticeMessage(first(searchParams?.notice));

  if (!organizationId || !canAdminister(context.role)) {
    return (
      <section className="page">
        <Header />
        <Notice kind="error">No tenes permisos de administrador para gestionar usuarios.</Notice>
      </section>
    );
  }

  const members = await listOrganizationMembers(context, organizationId);

  return (
    <section className="page">
      <Header />
      {notice ? (
        <Notice kind="ok">{notice}</Notice>
      ) : null}

      <form action={createOrganizationMemberAction} className="card p-4">
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="returnTo" value="/admin/users" />
        <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_minmax(220px,1fr)_150px_140px_auto] lg:items-end">
          <label className="block text-sm font-medium">
            Nombre
            <input
              name="fullName"
              required
              className="mt-2 w-full rounded border border-[var(--line)] px-3 py-2 focus-ring"
              autoComplete="name"
            />
          </label>
          <label className="block text-sm font-medium">
            Email
            <input
              name="email"
              type="email"
              required
              className="mt-2 w-full rounded border border-[var(--line)] px-3 py-2 focus-ring"
              autoComplete="email"
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="mt-2 w-full rounded border border-[var(--line)] px-3 py-2 focus-ring"
              autoComplete="new-password"
            />
          </label>
          <label className="block text-sm font-medium">
            Rol
            <select
              name="role"
              defaultValue="seller"
              className="mt-2 w-full rounded border border-[var(--line)] bg-white px-3 py-2 focus-ring"
            >
              {staffMemberRoles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </label>
          <PendingSubmitButton
            pendingLabel="Dando de alta..."
            className="focus-ring rounded bg-[var(--teal)] px-4 py-2 text-sm font-semibold text-white"
          >
            Dar de alta
          </PendingSubmitButton>
        </div>
        <input
          name="comment"
          placeholder="Comentario de auditoria"
          className="mt-3 w-full rounded border border-[var(--line)] px-3 py-2 text-sm focus-ring"
        />
      </form>

      <AdminUsersTable members={members} />
    </section>
  );
}

function Header() {
  return (
    <div>
      <PageHeader
        eyebrow="Administrador"
        title="Usuarios"
          description="Altas, roles y acceso de las personas de la organizacion."
        />
    </div>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function noticeMessage(notice: string | undefined) {
  if (!notice) return null;
  const messages: Record<string, string> = {
    member_created: "Usuario dado de alta.",
    member_updated: "Usuario actualizado.",
    [adminDomainErrors.invalidInput]: "Los datos enviados no son validos.",
    [adminDomainErrors.authUserCreateFailed]: "No se pudo crear o vincular el usuario de Auth.",
    [adminDomainErrors.forbidden]: "No tenes permisos para esta accion.",
    [adminDomainErrors.lastAdminRequired]: "La organizacion debe conservar al menos un administrador activo.",
    [adminDomainErrors.memberNotFound]: "No se encontro la membresia indicada.",
    [adminDomainErrors.profileNotFound]: "No se encontro el perfil indicado.",
    [adminDomainErrors.memberCreateFailed]: "No se pudo dar de alta el usuario.",
    [adminDomainErrors.memberSaveFailed]: "No se pudo actualizar el usuario."
  };

  return messages[notice] ?? null;
}

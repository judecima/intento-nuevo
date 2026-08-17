import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { getCurrentUserContext } from "@/lib/auth/context";
import { getDefaultRouteForRole, roleLabels } from "@/lib/domain/roles";
import { getPublicOrganization, organizationAccessNotices } from "@/lib/organizations/public-access";
import { joinOrganizationAction, signInForOrganizationAction, signUpCustomerAction } from "./actions";

type OrganizationEntryPageProps = {
  params: { slug: string };
  searchParams?: { notice?: string | string[] };
};

export default async function OrganizationEntryPage({ params, searchParams }: OrganizationEntryPageProps) {
  const organization = await getPublicOrganization(params.slug);

  if (!organization) notFound();

  const context = await getCurrentUserContext();
  const membership = context.memberships.find((item) => item.organizationId === organization.id) ?? null;
  const notice = noticeMessage(first(searchParams?.notice));

  // Ya pertenece: derecho a su area segun el rol.
  if (membership) {
    redirect(getDefaultRouteForRole(membership.role));
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[520px] flex-col justify-center gap-5 px-5 py-10">
      <header>
        <div className="eyebrow">Acceso</div>
        <h1 className="mt-1.5 text-[30px] font-semibold tracking-[-0.02em]">{organization.name}</h1>
        <p className="hint mt-2 text-[13px]">
          Entra con tu cuenta
          {organization.allowCustomerSignup ? " o crea una como cliente para cargar tus proyectos." : "."}
        </p>
      </header>

      {notice ? <div className="operation-banner">{notice}</div> : null}

      {context.user ? (
        <section className="card">
          <div className="card-head">
            <div>
              <div className="eyebrow-muted">Sesion iniciada</div>
              <h2 className="mt-1 text-[17px] font-semibold">{context.user.email}</h2>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <p className="text-sm text-[var(--muted)]">
              Tu cuenta todavia no pertenece a {organization.name}.
            </p>
            {organization.allowCustomerSignup ? (
              <form action={joinOrganizationAction}>
                <input type="hidden" name="slug" value={organization.slug} />
                <PendingSubmitButton pendingLabel="Asociando..." className="btn btn-primary focus-ring w-full">
                  Entrar como cliente de {organization.name}
                </PendingSubmitButton>
              </form>
            ) : (
              <p className="hint">
                Esta organizacion no acepta registro abierto. Pedile al administrador que te de de alta.
              </p>
            )}
            <Link href="/logout" className="btn focus-ring w-full">
              Salir
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="card-head">
              <div>
                <div className="eyebrow-muted">Ya tengo cuenta</div>
                <h2 className="mt-1 text-[17px] font-semibold">Ingresar</h2>
              </div>
            </div>
            <form action={signInForOrganizationAction} className="space-y-3 p-4">
              <input type="hidden" name="slug" value={organization.slug} />
              <label className="block">
                <span className="field-label">Email</span>
                <input name="email" type="email" required autoComplete="email" className="input mt-1.5" />
              </label>
              <label className="block">
                <span className="field-label">Contrasena</span>
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="input mt-1.5"
                />
              </label>
              <PendingSubmitButton pendingLabel="Ingresando..." className="btn btn-primary focus-ring w-full">
                Ingresar
              </PendingSubmitButton>
            </form>
          </section>

          {organization.allowCustomerSignup ? (
            <section className="card">
              <div className="card-head">
                <div>
                  <div className="eyebrow-muted">Soy cliente nuevo</div>
                  <h2 className="mt-1 text-[17px] font-semibold">Crear cuenta</h2>
                  <p className="hint mt-1.5">
                    El alta abierta es solo para clientes. Los roles de {roleLabels.seller.toLowerCase()},{" "}
                    {roleLabels.operator.toLowerCase()} y {roleLabels.admin.toLowerCase()} los asigna la organizacion.
                  </p>
                </div>
              </div>
              <form action={signUpCustomerAction} className="space-y-3 p-4">
                <input type="hidden" name="slug" value={organization.slug} />
                <label className="block">
                  <span className="field-label">Nombre y apellido</span>
                  <input name="fullName" required minLength={2} autoComplete="name" className="input mt-1.5" />
                </label>
                <label className="block">
                  <span className="field-label">Email</span>
                  <input name="email" type="email" required autoComplete="email" className="input mt-1.5" />
                </label>
                <label className="block">
                  <span className="field-label">Contrasena (minimo 8 caracteres)</span>
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="input mt-1.5"
                  />
                </label>
                <PendingSubmitButton pendingLabel="Creando cuenta..." className="btn btn-accent focus-ring w-full">
                  Crear cuenta de cliente
                </PendingSubmitButton>
              </form>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function noticeMessage(notice: string | undefined) {
  if (!notice) return null;
  return organizationAccessNotices[notice] ?? null;
}

import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { getCurrentUserContext } from "@/lib/auth/context";
import { canAdminister } from "@/lib/domain/admin";
import { createCustomerAction } from "@/lib/customers/actions";
import { listOrganizationCustomers } from "@/lib/customers/queries";
import Link from "next/link";

type Props = { searchParams?: { notice?: string } };

const notices: Record<string, string> = {
  customer_created: "Cliente dado de alta correctamente.",
  customer_invalid: "Revisa nombre, email y telefono.",
  customer_save_failed: "No se pudo guardar el cliente.",
  customer_already_staff: "Ese email ya pertenece a un usuario interno de la organizacion.",
  customer_forbidden: "No tenes permisos para administrar clientes."
};

export default async function SalesCustomersPage({ searchParams }: Props) {
  const context = await getCurrentUserContext();
  if (!context.activeOrganization || !(context.role === "seller" || canAdminister(context.role))) {
    return <div className="empty-state">No tenes permisos para administrar clientes.</div>;
  }
  const customers = await listOrganizationCustomers(context.activeOrganization.id);
  const notice = searchParams?.notice ? notices[searchParams.notice] : null;

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Ventas</div>
          <h1 className="mt-1.5 text-[30px] font-semibold">Clientes</h1>
          <p className="hint mt-2">Selecciona un cliente existente o da de alta uno nuevo para cargar un pedido.</p>
        </div>
        <Link href="/projects/new" className="btn btn-primary focus-ring">Cargar pedido</Link>
      </header>
      {notice ? <div className="operation-banner">{notice}</div> : null}

      <section className="card p-5">
        <h2 className="text-[19px] font-semibold">Nuevo cliente</h2>
        <form action={createCustomerAction} className="mt-4 grid gap-3 md:grid-cols-2">
          <input name="fullName" required minLength={2} placeholder="Nombre y apellido" className="input" />
          <input name="email" required type="email" placeholder="Email" className="input" />
          <input name="phone" required placeholder="Telefono" className="input" />
          <input name="address" placeholder="Direccion (opcional)" className="input" />
          <div className="md:col-span-2"><PendingSubmitButton pendingLabel="Guardando cliente..." className="btn btn-primary focus-ring">Dar de alta cliente</PendingSubmitButton></div>
        </form>
      </section>

      <section className="card overflow-hidden">
        <div className="card-head"><h2 className="text-[19px] font-semibold">Clientes registrados</h2></div>
        <div className="table-wrap">
          <table className="data-table"><thead><tr><th>Nombre</th><th>Email</th><th>Telefono</th><th>Direccion</th></tr></thead>
            <tbody>{customers.map((customer) => <tr key={customer.id}><td className="font-semibold">{customer.fullName}</td><td>{customer.email}</td><td>{customer.phone}</td><td>{customer.address || "-"}</td></tr>)}</tbody>
          </table>
          {customers.length === 0 ? <div className="empty-state">Todavia no hay clientes cargados.</div> : null}
        </div>
      </section>
    </section>
  );
}

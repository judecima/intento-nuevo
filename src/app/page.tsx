import Link from "next/link";
import { platformPath } from "@/lib/routing/routes";

const heroImage = "https://optionline-prod-files.s3.amazonaws.com/6-445-thumbnail.jpg";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--md-surface-bright)] text-[var(--ink)]">
      <section
        className="relative min-h-[82vh] overflow-hidden bg-cover bg-center px-5 py-6 text-white"
        style={{ backgroundImage: `url(${heroImage})` }}
      >
        <div className="absolute inset-0 bg-black/70" />
        <nav className="relative mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="text-[20px] font-semibold">Corte SaaS</div>
          <Link href={platformPath("/login")} className="focus-ring border border-white/35 px-4 py-2 text-sm font-semibold">
            Super usuario
          </Link>
        </nav>

        <div className="relative mx-auto flex min-h-[68vh] max-w-6xl flex-col justify-center">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ffe08a]">
              Plataforma multi-organizacion
            </div>
            <h1 className="mt-4 max-w-3xl text-[44px] font-medium leading-[50px] md:text-[64px] md:leading-[70px]">
              Gestion de cortes para organizaciones
            </h1>
            <p className="mt-5 max-w-2xl text-[17px] leading-7 text-white/82">
              Centraliza clientes, proyectos, optimizacion de tableros, pedidos, produccion y XML para seccionadora en
              entornos separados por organizacion.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-5 py-10 md:grid-cols-3">
        <Feature title="Tenancy por URL" text="Cada organizacion trabaja desde su propia ruta, con usuarios y permisos aislados." />
        <Feature title="Flujo operativo" text="Ventas, administracion y produccion comparten estados trazables de cada pedido." />
        <Feature title="Optimizacion industrial" text="Planes de corte, remanentes, cantos y exportacion de archivos para maquina." />
      </section>
    </main>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <article className="border border-[var(--line)] bg-white p-5">
      <h2 className="text-[18px] font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">{text}</p>
    </article>
  );
}

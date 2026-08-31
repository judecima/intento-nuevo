/* eslint-disable @next/next/no-img-element -- branding logo can be external. */
import Link from "next/link";
import { SurfaceCard, StatusChip } from "@/components/ui/material";
import { getPublicPlatformBranding } from "@/lib/branding/public";
import { brandThemeCssText, brandThemeStyle } from "@/lib/branding/theme";
import { platformPath } from "@/lib/routing/routes";

const heroImage = "https://optionline-prod-files.s3.amazonaws.com/6-445-thumbnail.jpg";

export default async function HomePage() {
  const branding = await getPublicPlatformBranding();
  const brandStyle = brandThemeStyle(branding);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `:root{${brandThemeCssText(branding)}}` }} />
      <main style={brandStyle} className="min-h-screen bg-[var(--md-surface-bright)] text-[var(--ink)]">
      <section
        className="relative min-h-[78vh] overflow-hidden bg-cover bg-center px-5 py-6 text-white"
        style={{ backgroundImage: `url(${heroImage})` }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,15,15,.88),rgba(9,15,15,.58),rgba(9,15,15,.25))]" />
        <nav className="relative mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {branding.logoUrl ? (
              <span className="inline-flex h-11 max-w-[190px] rounded-lg bg-transparent p-2">
                <img src={branding.logoUrl} alt={`Logo de ${branding.name}`} className="h-full w-full object-contain object-left" />
              </span>
            ) : null}
            <div className="truncate text-[20px] font-medium tracking-normal">{branding.name}</div>
          </div>
          <Link
            href={platformPath("/login")}
            className="focus-ring rounded-full border border-white/35 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Ingresar
          </Link>
        </nav>

        <div className="relative mx-auto flex min-h-[62vh] max-w-6xl flex-col justify-center">
          <div className="max-w-3xl">
            <StatusChip value="Plataforma multi-organizacion" color="amber" className="w-fit bg-amber-50/95 text-amber-900" />
            <h1 className="mt-5 max-w-3xl text-[44px] font-medium leading-[50px] md:text-[60px] md:leading-[66px]">
              {branding.name}
            </h1>
            <p className="mt-5 max-w-2xl text-[17px] leading-7 text-white/82">
              Centraliza clientes, proyectos, optimizacion de tableros, pedidos, produccion y XML para seccionadora en
              entornos separados por organizacion.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-5 py-8 md:grid-cols-3">
        <Feature title="Tenancy por URL" text="Cada organizacion trabaja desde su propia ruta, con usuarios y permisos aislados." />
        <Feature title="Flujo operativo" text="Ventas, administracion y produccion comparten estados trazables de cada pedido." />
        <Feature title="Optimizacion industrial" text="Planes de corte, remanentes, cantos y exportacion de archivos para maquina." />
      </section>
      </main>
    </>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <SurfaceCard bodyClassName="p-5">
      <article>
        <h2 className="text-[18px] font-medium">{title}</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{text}</p>
      </article>
    </SurfaceCard>
  );
}

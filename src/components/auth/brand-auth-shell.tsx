/* eslint-disable @next/next/no-img-element -- branding logo can be external. */
import type { ReactNode } from "react";
import type { BrandIdentity } from "@/lib/branding/identity";
import { brandThemeCssText, brandThemeStyle } from "@/lib/branding/theme";

type BrandAuthShellProps = {
  brand: BrandIdentity;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function BrandAuthShell({ brand, eyebrow, title, description, children }: BrandAuthShellProps) {
  const brandStyle = brandThemeStyle(brand);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `:root{${brandThemeCssText(brand)}}` }} />
      <main
        style={brandStyle}
        className="relative min-h-screen overflow-hidden bg-[var(--bg)] px-5 py-8 text-[var(--ink)]"
      >
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.14]"
        style={{
          background: `linear-gradient(135deg, ${brand.primaryColor}, transparent 46%), radial-gradient(circle at 85% 15%, ${brand.secondaryColor}, transparent 32%)`
        }}
      />
      <section className="relative mx-auto grid min-h-[calc(100vh-64px)] w-full max-w-5xl overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--md-surface-container-lowest)] shadow-xl lg:grid-cols-[minmax(0,0.92fr)_minmax(380px,1fr)]">
        <aside
          className="flex min-h-[260px] flex-col justify-between p-7 text-white md:p-9"
          style={{
            background: `linear-gradient(145deg, ${brand.primaryColor}, var(--grafito) 72%)`
          }}
        >
          <div>
            <BrandLogo brand={brand} />
            <div className="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/72">{eyebrow}</div>
            <h1 className="mt-3 max-w-[14ch] text-[34px] font-medium leading-[40px] tracking-normal md:text-[42px] md:leading-[48px]">
              {brand.name}
            </h1>
          </div>
          <div className="mt-8 h-1.5 w-28 rounded-full bg-[var(--brand-secondary)]" />
        </aside>

        <div className="flex items-center p-6 md:p-9">
          <div className="w-full">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--teal)]">{brand.name}</div>
            <h2 className="mt-3 text-[30px] font-medium tracking-normal">{title}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">{description}</p>
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </section>
      </main>
    </>
  );
}

function BrandLogo({ brand }: { brand: BrandIdentity }) {
  if (brand.logoUrl) {
    return (
      <div className="inline-flex max-w-[260px] rounded-lg bg-transparent p-3">
        <img src={brand.logoUrl} alt={`Logo de ${brand.name}`} className="h-14 max-w-[220px] object-contain object-left" />
      </div>
    );
  }

  return (
    <div className="grid h-16 w-16 place-items-center rounded-lg bg-white/14 text-[26px] font-semibold text-white ring-1 ring-white/22">
      {brand.name.slice(0, 1).toUpperCase()}
    </div>
  );
}

import { SurfaceCard, SurfaceTitle } from "@/components/ui/material";

type SectionPlaceholderProps = {
  title: string;
  eyebrow: string;
  children?: React.ReactNode;
};

export function SectionPlaceholder({ title, eyebrow, children }: SectionPlaceholderProps) {
  return (
    <section className="max-w-5xl">
      <SurfaceTitle eyebrow={eyebrow} title={title} />
      <SurfaceCard className="mt-5" bodyClassName="p-6 text-sm text-[var(--muted)] md:p-8">
        {children ?? "No hay contenido disponible para esta vista."}
      </SurfaceCard>
    </section>
  );
}

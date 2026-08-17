type SectionPlaceholderProps = {
  title: string;
  eyebrow: string;
  children?: React.ReactNode;
};

export function SectionPlaceholder({ title, eyebrow, children }: SectionPlaceholderProps) {
  return (
    <section className="max-w-5xl">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--teal)]">
        {eyebrow}
      </div>
      <h1 className="mt-2 text-[32px] font-bold tracking-[-0.03em]">{title}</h1>
      <div className="mt-5 rounded-[var(--r)] border border-[var(--line)] bg-[rgba(255,255,255,.55)] p-8 text-sm text-[var(--muted)]">
        {children ?? "Modulo preparado para la siguiente fase de implementacion."}
      </div>
    </section>
  );
}

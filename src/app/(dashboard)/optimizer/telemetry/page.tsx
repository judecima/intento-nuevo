import { notFound } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/context";
import { getOptimizationTelemetrySummary } from "@/lib/optimizations/telemetry";

export default async function OptimizerTelemetryPage() {
  const context = await getCurrentUserContext();
  const organization = context.activeOrganization;

  if (!context.user || !organization || (context.role !== "admin" && !context.isPlatformAdmin)) {
    notFound();
  }

  const summary = await getOptimizationTelemetrySummary(organization.id, 250);

  return (
    <section className="mx-auto max-w-[1200px] space-y-5">
      <header>
        <div className="eyebrow">Operacion</div>
        <h1 className="mt-1 text-[30px] font-bold tracking-[-0.025em]">Telemetria del optimizador</h1>
        <p className="hint mt-2">
          Ultimas {summary.sampleCount} ejecuciones visibles de {organization.name}. Los tiempos usan los timestamps del job y
          `metrics.engineMs` del resultado; no modifican el kernel.
        </p>
      </header>

      <div className="metric-grid">
        <Metric label="Completadas" value={summary.completed.toString()} />
        <Metric label="Activas" value={summary.active.toString()} />
        <Metric label="Fallidas" value={summary.failed.toString()} />
        <Metric label="Canceladas" value={summary.cancelled.toString()} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TimingCard title="Tiempo total" help="created_at → completed_at" values={summary.totalMs} />
        <TimingCard title="Tiempo en cola" help="created_at → started_at" values={summary.queuedMs} />
        <TimingCard title="Tiempo de ejecucion" help="started_at → completed_at" values={summary.runMs} />
        <TimingCard title="Motor" help="result_json.metrics.engineMs" values={summary.engineMs} />
      </div>

      <section className="card p-4 text-[13px] text-[var(--muted)]">
        <strong className="text-[var(--grafito)]">Lectura recomendada:</strong> si `cola` crece pero `motor` permanece estable,
        falta capacidad de workers. Si `motor` crece, el problema esta en el workload del optimizador y recien ahi corresponde
        abrir una investigacion concreta sobre casos reales.
      </section>
    </section>
  );
}

function TimingCard({
  title,
  help,
  values
}: {
  title: string;
  help: string;
  values: { p50: number | null; p95: number | null; p99: number | null };
}) {
  return (
    <section className="card overflow-hidden">
      <div className="card-head">
        <div>
          <div className="eyebrow-muted">Latencia</div>
          <h2 className="mt-1 text-[18px] font-bold">{title}</h2>
          <div className="mt-1 font-mono text-[10.5px] text-[var(--muted)]">{help}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 p-4">
        <Metric label="p50" value={formatMs(values.p50)} />
        <Metric label="p95" value={formatMs(values.p95)} />
        <Metric label="p99" value={formatMs(values.p99)} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

function formatMs(value: number | null): string {
  if (value == null) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value < 10000 ? 2 : 1)} s`;
}

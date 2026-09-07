import type { CutDashboardMetrics, CutMetricsBucket } from "@/lib/dashboard/cut-metrics";

type CutMetricsPanelProps = {
  metrics: CutDashboardMetrics;
};

export function CutMetricsPanel({ metrics }: CutMetricsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Cortes hoy"
          value={metrics.summary.todayCuts}
          detail={`${metrics.summary.todayMovements} desplazamientos`}
        />
        <MetricCard
          title="Cortes ultimos 7 dias"
          value={metrics.summary.last7DaysCuts}
          detail={`${metrics.summary.last7DaysMovements} desplazamientos`}
        />
        <MetricCard
          title="Cortes semana actual"
          value={metrics.summary.currentWeekCuts}
          detail={`${metrics.summary.currentWeekMovements} desplazamientos`}
        />
        <MetricCard
          title="Cortes ultimas 7 semanas"
          value={metrics.summary.last7WeeksCuts}
          detail={`${metrics.summary.last7WeeksMovements} desplazamientos`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <LineChart title="Cortes diarios" subtitle="Ultimos 7 dias" buckets={metrics.daily} />
        <LineChart title="Cortes semanales" subtitle="Ultimas 7 semanas" buckets={metrics.weekly} />
      </div>
    </div>
  );
}

function MetricCard({ title, value, detail }: { title: string; value: number; detail: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--md-surface-container-lowest)] p-4 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{title}</div>
      <div className="mt-2 font-mono text-[32px] font-semibold leading-none text-[var(--ink)]">{formatNumber(value)}</div>
      <div className="mt-2 text-[12px] text-[var(--muted)]">{detail}</div>
    </div>
  );
}

function LineChart({
  title,
  subtitle,
  buckets
}: {
  title: string;
  subtitle: string;
  buckets: CutMetricsBucket[];
}) {
  const seriesMax = Math.max(1, ...buckets.flatMap((bucket) => [bucket.cutCount, bucket.movementCount]));
  const chart = buildLineChart(buckets, seriesMax);

  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--md-surface-container-lowest)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--teal)]">{subtitle}</div>
          <h2 className="mt-1 text-[18px] font-medium text-[var(--ink)]">{title}</h2>
        </div>
        <div className="font-mono text-[12px] text-[var(--muted)]">{formatNumber(sumCuts(buckets))} cortes</div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-[var(--muted)]">
        <LegendItem color="bg-[var(--brand-primary)]" label="Cortes" value={sumCuts(buckets)} />
        <LegendItem color="bg-[var(--brand-secondary)]" label="Desplazamientos" value={sumMovements(buckets)} />
      </div>

      <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--md-surface-container)] p-3">
        <svg
          viewBox="0 0 340 190"
          role="img"
          aria-label={`${title}: ${buckets.map((bucket) => `${bucket.label}, ${bucket.cutCount} cortes y ${bucket.movementCount} desplazamientos`).join("; ")}`}
          className="h-[230px] w-full overflow-visible"
        >
          {chart.grid.map((line) => (
            <g key={line.value}>
              <line x1="34" x2="328" y1={line.y} y2={line.y} stroke="var(--line)" strokeWidth="1" />
              <text x="0" y={line.y + 4} fill="var(--muted)" fontSize="10" fontFamily="monospace">
                {line.value}
              </text>
            </g>
          ))}

          <path d={chart.cutsPath} fill="none" stroke="var(--brand-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d={chart.movementsPath} fill="none" stroke="var(--brand-secondary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {chart.cutPoints.map((point) => (
            <circle key={`cut-${point.key}`} cx={point.x} cy={point.y} r="4" fill="var(--brand-primary)" />
          ))}
          {chart.movementPoints.map((point) => (
            <circle key={`movement-${point.key}`} cx={point.x} cy={point.y} r="4" fill="var(--brand-secondary)" />
          ))}

          {chart.cutPoints.map((point, index) => (
            <g key={`label-${point.key}`}>
              <text x={point.x} y="174" textAnchor="middle" fill="var(--muted)" fontSize="10" fontFamily="monospace">
                {buckets[index]?.label}
              </text>
              <text x={point.x} y="188" textAnchor="middle" fill="var(--md-on-surface)" fontSize="10" fontFamily="monospace">
                {buckets[index]?.cutCount}/{buckets[index]?.movementCount}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span>{label}</span>
      <span className="font-mono text-[var(--ink)]">{formatNumber(value)}</span>
    </span>
  );
}

function sumCuts(buckets: CutMetricsBucket[]): number {
  return buckets.reduce((total, bucket) => total + bucket.cutCount, 0);
}

function sumMovements(buckets: CutMetricsBucket[]): number {
  return buckets.reduce((total, bucket) => total + bucket.movementCount, 0);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-AR").format(value);
}

type ChartPoint = {
  key: string;
  x: number;
  y: number;
};

function buildLineChart(buckets: CutMetricsBucket[], maxValue: number) {
  const left = 34;
  const top = 16;
  const width = 294;
  const height = 132;
  const step = buckets.length > 1 ? width / (buckets.length - 1) : width;
  const normalizedMax = niceMax(maxValue);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = Math.round(normalizedMax * (1 - ratio));
    return {
      value,
      y: top + height * ratio
    };
  });

  const cutPoints = buckets.map((bucket, index) => ({
    key: bucket.key,
    x: left + step * index,
    y: top + height - (bucket.cutCount / normalizedMax) * height
  }));
  const movementPoints = buckets.map((bucket, index) => ({
    key: bucket.key,
    x: left + step * index,
    y: top + height - (bucket.movementCount / normalizedMax) * height
  }));

  return {
    cutPoints,
    movementPoints,
    cutsPath: linePath(cutPoints),
    movementsPath: linePath(movementPoints),
    grid
  };
}

function linePath(points: ChartPoint[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function niceMax(value: number): number {
  if (value <= 5) return 5;
  if (value <= 10) return 10;
  if (value <= 25) return 25;
  if (value <= 50) return 50;
  return Math.ceil(value / 100) * 100;
}

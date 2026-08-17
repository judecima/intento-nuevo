import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

const context = {
  user: { id: "preview", email: "julio@taller.com" },
  profile: { full_name: "Julio Decima" },
  activeOrganization: { name: "Taller Demo" },
  role: "admin",
  loadError: null
} as never;

export default function UiPreviewPage() {
  return (
    <AppShell context={context}>
      <section className="mx-auto max-w-[1200px] space-y-5">
        <header>
          <div className="eyebrow">Cliente</div>
          <h1 className="mt-1.5 text-[30px] font-bold tracking-[-0.025em]">Proyecto demo cocina</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="badge badge-ok">Optimizado</span>
            <span className="badge chip-mono">v6</span>
            <span className="badge chip-mono">2750 × 1830 mm</span>
            <span className="badge badge-accent">con veta</span>
            <span className="badge">Solo lectura</span>
          </div>
        </header>

        <div className="metric-grid">
          <div className="metric metric-strong">
            <div className="metric-value">78.43%</div>
            <div className="metric-label">Aprovechamiento</div>
          </div>
          <div className="metric">
            <div className="metric-value">7</div>
            <div className="metric-label">Placas</div>
          </div>
          <div className="metric">
            <div className="metric-value">31</div>
            <div className="metric-label">Piezas</div>
          </div>
          <div className="metric">
            <div className="metric-value">63.30</div>
            <div className="metric-label">m de sierra</div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="card">
            <div className="card-head">
              <div>
                <div className="eyebrow-muted">Optimizacion</div>
                <h2 className="mt-1 text-[19px] font-bold">Plano de corte</h2>
                <p className="hint mt-1.5">7 placas · motor baseline · guardado 14/08/26, 10:12</p>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-sm">Imprimir</button>
                <button className="btn btn-primary btn-sm">Guardar</button>
                <button className="btn btn-accent btn-sm">Optimizar</button>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="operation-banner">
                Optimizando el proyecto…
                <span className="operation-subtext">Puede tardar unos segundos</span>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="field-label">Sierra (kerf)</span>
                  <input className="input input-num mt-1.5" defaultValue="4.5" />
                </label>
                <label className="block">
                  <span className="field-label">Refilado X</span>
                  <input className="input input-num mt-1.5" defaultValue="10" />
                </label>
                <label className="block">
                  <span className="field-label">Motor</span>
                  <select className="select mt-1.5" defaultValue="baseline">
                    <option value="baseline">Baseline rapido</option>
                  </select>
                </label>
              </div>

              <div className="overflow-hidden rounded-[var(--r-md)] border border-[var(--line)]">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Cant</th>
                      <th>Medida (mm)</th>
                      <th>Pieza</th>
                      <th>Placa</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>7</td>
                      <td>1300 × 900</td>
                      <td className="txt">Estantes</td>
                      <td>1, 2</td>
                    </tr>
                    <tr className="is-active">
                      <td>18</td>
                      <td>600 × 1400</td>
                      <td className="txt">Laterales</td>
                      <td>3</td>
                    </tr>
                    <tr>
                      <td>6</td>
                      <td>900 × 800</td>
                      <td className="txt">Cajon base</td>
                      <td>4</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="empty-state">
                <strong>Todavia no hay plan</strong>
                Carga las piezas y proba la optimizacion.
              </div>
            </div>
          </section>

          <aside className="card h-fit">
            <div className="card-head">
              <div>
                <div className="eyebrow-muted">Material</div>
                <h2 className="mt-1 text-[17px] font-bold">AGL 15MM ABEDUL</h2>
              </div>
            </div>
            <div className="space-y-3 p-4">
              <p className="hint">Tablero con veta: las piezas mantienen su orientacion.</p>
              <button className="btn btn-primary w-full">Crear proyecto</button>
              <button className="btn w-full">Cancelar</button>
              <button className="btn btn-danger w-full">Eliminar</button>
            </div>
          </aside>
        </div>
      </section>
    </AppShell>
  );
}

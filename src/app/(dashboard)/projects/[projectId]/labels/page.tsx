import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/optimizer/print-button";
import { getCurrentUserContext } from "@/lib/auth/context";
import { buildCutPlanView, type CutPlanPiece } from "@/lib/optimizations/plan-view";
import { getLatestOptimizationForProject } from "@/lib/optimizations/queries";
import { getProjectEditorData } from "@/lib/projects/queries";
import { toScopedPath } from "@/lib/routing/routes";

type LabelsPageProps = {
  params: { projectId: string };
};

export default async function ProjectLabelsPage({ params }: LabelsPageProps) {
  const [context, data, optimization] = await Promise.all([
    getCurrentUserContext(),
    getProjectEditorData(params.projectId),
    getLatestOptimizationForProject(params.projectId)
  ]);

  if (!data || !optimization) notFound();
  if (Number(optimization.result.project_version) !== Number(data.project.version)) notFound();

  const plan = buildCutPlanView({
    job: optimization.job,
    result: optimization.result,
    boards: optimization.boards,
    pieces: optimization.pieces,
    cuts: optimization.cuts,
    remnants: optimization.remnants,
    project: {
      version: Number(data.project.version),
      board_width: Number(data.project.board_width),
      board_height: Number(data.project.board_height),
      board_thickness: Number(data.project.board_thickness),
      kerf: Number(data.project.kerf),
      trim_x: Number(data.project.trim_x),
      trim_y: Number(data.project.trim_y),
      min_remnant: Number(data.project.min_remnant),
      grain_enabled: Boolean(data.project.grain_enabled)
    },
    material: data.material ? { code: data.material.code, description: data.material.description } : null
  });

  const labels = plan.boards.flatMap((board) =>
    board.pieces.map((piece) => ({ piece, boardNumber: board.index + 1 }))
  );

  return (
    <section className="mx-auto max-w-[1100px] space-y-5">
      <style>{`
        @page { size: A4; margin: 8mm; }
        @media print {
          .label-sheet { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 4mm !important; }
          .piece-label { break-inside: avoid; page-break-inside: avoid; min-height: 42mm; border: 1px solid #111 !important; box-shadow: none !important; }
        }
      `}</style>

      <header className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href={toScopedPath(context.routeBasePath, `/projects/${data.project.id}`)}
            className="focus-ring text-[12px] text-[var(--teal)] hover:underline"
          >
            ← Volver al proyecto
          </Link>
          <div className="mt-3 eyebrow">Produccion</div>
          <h1 className="mt-1 text-[28px] font-bold">Etiquetas de piezas</h1>
          <p className="hint mt-1.5">
            {data.project.name} · v{data.project.version} · {labels.length} etiquetas
          </p>
        </div>
        <PrintButton label="Imprimir etiquetas" />
      </header>

      <div className="label-sheet grid gap-3 sm:grid-cols-2">
        {labels.map(({ piece, boardNumber }) => (
          <PieceLabel
            key={piece.id}
            piece={piece}
            boardNumber={boardNumber}
            projectName={data.project.name}
            projectVersion={Number(data.project.version)}
            material={`${plan.meta.materialCode || "S/C"} · ${plan.meta.materialName}`}
            thickness={plan.meta.thickness}
          />
        ))}
      </div>
    </section>
  );
}

function PieceLabel({
  piece,
  boardNumber,
  projectName,
  projectVersion,
  material,
  thickness
}: {
  piece: CutPlanPiece;
  boardNumber: number;
  projectName: string;
  projectVersion: number;
  material: string;
  thickness: number;
}) {
  return (
    <article className="piece-label rounded-[var(--r-md)] border border-[var(--line)] bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-2">
        <div className="min-w-0">
          <div className="font-mono text-[10px] text-[var(--muted)]">{projectName} · v{projectVersion}</div>
          <div className="mt-1 truncate text-[18px] font-black tracking-tight">{piece.reference || `Pieza ${piece.index + 1}`}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] text-[var(--muted)]">PLACA</div>
          <div className="text-[22px] font-black">{boardNumber}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-4">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-tight">{piece.description || "Sin descripcion"}</div>
          <div className="mt-2 font-mono text-[21px] font-black">
            {Math.round(piece.sourceWidth)} × {Math.round(piece.sourceHeight)}
            <span className="ml-1 text-[10px] font-normal">mm</span>
          </div>
          <div className="mt-1 text-[10.5px] text-[var(--muted)]">
            {material} · {thickness} mm
          </div>
        </div>
        <div className="text-right text-[10.5px] leading-5">
          <div>{piece.rotated ? "Rotada 90°" : "Sin rotar"}</div>
          <div>{edgeText(piece)}</div>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between border-t border-dashed border-[var(--line)] pt-2 font-mono text-[9.5px] text-[var(--muted)]">
        <span>ID {piece.id.slice(0, 12)}</span>
        <span>
          pos {Math.round(piece.x)},{Math.round(piece.y)} · nivel {piece.level}
        </span>
      </div>
    </article>
  );
}

function edgeText(piece: CutPlanPiece): string {
  const sides = [
    piece.edges.top ? "sup" : null,
    piece.edges.right ? "der" : null,
    piece.edges.bottom ? "inf" : null,
    piece.edges.left ? "izq" : null
  ].filter(Boolean);

  if (sides.length === 0) return "Sin canto";
  const type = piece.edgeType === "thick" ? "2 mm" : piece.edgeType === "both" ? "mixto" : "0,45";
  return `Canto ${type}: ${sides.join("/")}`;
}

import type {
  IndependentSlicesValidation,
  LegacyPlan,
  LegacyTreeNode,
  LegacyTreePart
} from "../types";

export function validateIndependentSlices(
  plan: Pick<LegacyPlan, "placas" | "opts">,
  tolerance = 1e-6,
): IndependentSlicesValidation {
  const saw = Number(plan?.opts?.sierra ?? 0);
  const errores: string[] = [];
  const cerca = (a: number, b: number) => Math.abs((Number(a) || 0) - (Number(b) || 0)) <= tolerance;

  function visitar(nodo: LegacyTreeNode | undefined, ruta: string) {
    if (!nodo || !Array.isArray(nodo.partes)) return;

    const partes = nodo.partes.filter((part): part is LegacyTreePart & { bloque: NonNullable<LegacyTreePart["bloque"]> } =>
      Boolean(part?.bloque),
    );

    let cursor = nodo.dir === "x" ? nodo.x : nodo.y;
    const limite = nodo.dir === "x" ? nodo.x + nodo.w : nodo.y + nodo.h;

    for (let index = 0; index < partes.length; index++) {
      const part = partes[index];
      const block = part.bloque;
      const inicio = nodo.dir === "x" ? block.x : block.y;
      const espesor = nodo.dir === "x" ? block.w : block.h;
      const perpendicular = nodo.dir === "x" ? block.h : block.w;
      const perpPadre = nodo.dir === "x" ? nodo.h : nodo.w;
      const inicioPerp = nodo.dir === "x" ? block.y : block.x;
      const inicioPerpPadre = nodo.dir === "x" ? nodo.y : nodo.x;

      if (!cerca(inicio, cursor)) {
        errores.push(
          `${ruta}: sibling ${index + 1} starts at ${inicio.toFixed(3)} and should start at ${cursor.toFixed(3)}`,
        );
      }

      if (!cerca(espesor, part.cut)) {
        errores.push(
          `${ruta}: sibling ${index + 1} cut=${Number(part.cut).toFixed(3)} but real thickness=${espesor.toFixed(3)}`,
        );
      }

      if (!cerca(perpendicular, perpPadre) || !cerca(inicioPerp, inicioPerpPadre)) {
        errores.push(`${ruta}: sibling ${index + 1} does not span the parent perpendicular dimension`);
      }

      cursor = inicio + espesor;
      if (index < partes.length - 1) cursor += saw;

      visitar(part.hijo, `${ruta}/${index + 1}`);
    }

    if (cursor > limite + tolerance) {
      errores.push(`${ruta}: siblings exceed parent region (${cursor.toFixed(3)} > ${limite.toFixed(3)})`);
    }
  }

  for (let index = 0; index < (plan?.placas ?? []).length; index++) {
    visitar(plan.placas[index].arbol, `board${index + 1}`);
  }

  return { ok: errores.length === 0, errores };
}

import type { ReactNode } from "react";

/**
 * Estado vacio de una lista.
 *
 * Unifica los tres estilos que convivian (caja blanca con borde, caja punteada
 * translucida, y la clase `.empty-state`) y, sobre todo, el texto: un vacio
 * que solo dice "no hay datos" deja al usuario sin saber si se rompio algo o
 * si todavia no le toca hacer nada. Cada vacio explica por que esta vacio y,
 * cuando el usuario puede hacer algo, ofrece la accion.
 */
export function EmptyState({
  title,
  children,
  action
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {children ? <p className="mx-auto max-w-[52ch]">{children}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

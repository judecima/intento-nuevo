import type { ReactNode } from "react";

export type NoticeKind = "info" | "ok" | "warn" | "error";

/**
 * Las clases van escritas enteras y no como `notice-${kind}`: Tailwind purga
 * la capa `components` segun los literales que encuentra en el codigo, y un
 * nombre armado en runtime se queda sin estilos en produccion.
 */
const kindClasses: Record<NoticeKind, string> = {
  info: "notice-info",
  ok: "notice-ok",
  warn: "notice-warn",
  error: "notice-error"
};

/**
 * Aviso de pantalla.
 *
 * Unifica los tres estilos que convivian: el bloque con radio y sombra del
 * detalle de proyecto, el `border-l-4 bg-white` sin radio de produccion y
 * ventas, y el mensaje inline del workspace. El mismo mensaje tiene que verse
 * igual en cualquier seccion.
 */
export function Notice({
  kind = "info",
  title,
  children,
  className = ""
}: {
  kind?: NoticeKind;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`notice ${kindClasses[kind]} ${className}`} role={kind === "error" ? "alert" : "status"}>
      <div>
        {title ? <strong className="notice-title">{title}</strong> : null}
        <div className="notice-body">{children}</div>
      </div>
    </div>
  );
}

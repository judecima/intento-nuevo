import type { ReactNode } from "react";

type PageHeaderProps = {
  /** Contexto corto: el rol o el area. Nunca repite el titulo. */
  eyebrow: string;
  title: string;
  /** Una frase que dice que se hace en esta pantalla. */
  description?: string;
  /** Acciones primarias de la pantalla, alineadas a la derecha. */
  actions?: ReactNode;
  /** Metricas o filtros que acompanan al titulo. */
  aside?: ReactNode;
};

/**
 * Encabezado unico de seccion.
 *
 * Antes cada pagina armaba el suyo: unas con SurfaceTitle (Material Tailwind,
 * variant h3) y otras con <h1 className="text-3xl">. Al navegar cambiaba la
 * tipografia del titulo, y eso se lee como otra aplicacion, no como otra
 * seccion.
 */
export function PageHeader({ eyebrow, title, description, actions, aside }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {aside ? <div className="page-header-aside">{aside}</div> : null}
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}

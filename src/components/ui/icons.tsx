/**
 * Set de iconos de navegacion y chrome.
 *
 * SVG inline en vez de @mui/icons-material: la app casi no usa MUI fuera de
 * los date pickers, y un icono de navegacion tiene que heredar `currentColor`
 * para funcionar igual sobre el drawer oscuro y sobre superficie clara.
 */
export type IconName =
  | "dashboard"
  | "process"
  | "projects"
  | "newProject"
  | "orders"
  | "salesOrders"
  | "salesApproved"
  | "customers"
  | "queue"
  | "approved"
  | "cutting"
  | "edgebanding"
  | "completed"
  | "users"
  | "materials"
  | "machines"
  | "settings"
  | "audit"
  | "organizations"
  | "duplicate"
  | "trash";

type IconProps = {
  name: IconName;
  className?: string;
};

/** Trazos de cada icono, en una grilla de 24x24. */
const paths: Record<IconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="8.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="5" rx="1.5" />
      <rect x="3" y="14.5" width="7.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="11" width="7.5" height="10" rx="1.5" />
    </>
  ),
  process: (
    <>
      <path d="M4 7h10" />
      <path d="M4 12h16" />
      <path d="M4 17h6" />
      <circle cx="17.5" cy="7" r="2.5" />
      <circle cx="13.5" cy="17" r="2.5" />
    </>
  ),
  projects: (
    <>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h7A1.5 1.5 0 0 1 19 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17.5Z" />
      <path d="M3 10.5h16" />
    </>
  ),
  newProject: (
    <>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h7A1.5 1.5 0 0 1 19 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17.5Z" />
      <path d="M11 11v6" />
      <path d="M8 14h6" />
    </>
  ),
  orders: (
    <>
      <path d="M6 3.5h9l4 4V20a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 6 20Z" />
      <path d="M15 3.5V8h4" />
      <path d="M9.5 13h6" />
      <path d="M9.5 16.5h4" />
    </>
  ),
  salesOrders: (
    <>
      <path d="M3.5 5h2l2.2 9.5h9.6L19 8H6.2" />
      <circle cx="9.5" cy="18.5" r="1.4" />
      <circle cx="16.5" cy="18.5" r="1.4" />
    </>
  ),
  salesApproved: (
    <>
      <path d="M3.5 5h2l2.2 9.5h9.6L19 8H6.2" />
      <path d="M9 10.5l1.8 1.8L14.5 8.5" />
    </>
  ),
  customers: (
    <>
      <circle cx="9.5" cy="8.5" r="3.5" />
      <path d="M3.5 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6" />
      <path d="M18 14.6c1.7.8 2.8 2.4 2.8 4.4" />
    </>
  ),
  queue: (
    <>
      <path d="M4 5.5h16" />
      <path d="M4 12h16" />
      <path d="M4 18.5h16" />
      <circle cx="8" cy="5.5" r="1.6" />
      <circle cx="14" cy="12" r="1.6" />
      <circle cx="10" cy="18.5" r="1.6" />
    </>
  ),
  approved: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.3 12.2l2.6 2.6 4.9-5.2" />
    </>
  ),
  cutting: (
    <>
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
      <path d="M8.3 15.7 18 4.5" />
      <path d="M15.7 15.7 6 4.5" />
    </>
  ),
  edgebanding: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="1.5" />
      <path d="M3.5 9.5h17" />
      <path d="M7 13.5h6" />
    </>
  ),
  completed: (
    <>
      <path d="M5 4.5h14v15l-7-3.2-7 3.2Z" />
      <path d="M9 10.3l2.2 2.2 4-4.2" />
    </>
  ),
  users: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20c0-3.8 3.4-6.3 7.5-6.3s7.5 2.5 7.5 6.3" />
    </>
  ),
  materials: (
    <>
      <rect x="3.5" y="4.5" width="17" height="6" rx="1.2" />
      <rect x="3.5" y="13.5" width="17" height="6" rx="1.2" />
      <path d="M7.5 7.5h3" />
      <path d="M7.5 16.5h3" />
    </>
  ),
  machines: (
    <>
      <rect x="3.5" y="9" width="17" height="10.5" rx="1.5" />
      <path d="M8 9V6.5a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 16 6.5V9" />
      <path d="M7.5 13.5h5" />
      <circle cx="16.5" cy="15.5" r="1.4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" />
    </>
  ),
  audit: (
    <>
      <path d="M6 3.5h8l4.5 4.5V20a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" />
      <path d="M14 3.5V8h4.5" />
      <circle cx="11" cy="14" r="2.6" />
      <path d="M13 16l2 2" />
    </>
  ),
  duplicate: (
    <>
      <rect x="9" y="9" width="11.5" height="11.5" rx="1.8" />
      <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15" />
      <path d="M9.5 6.5V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
      <path d="M6.5 6.5 7.4 20a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9l.9-13.5" />
      <path d="M10.5 10.5v6.5M13.5 10.5v6.5" />
    </>
  ),
  organizations: (
    <>
      <path d="M4 20.5V6.2a1 1 0 0 1 .7-.95l6-1.9a1 1 0 0 1 1.3.95V20.5" />
      <path d="M12 10h6.5a1 1 0 0 1 1 1v9.5" />
      <path d="M2.5 20.5h19" />
      <path d="M7 9h2M7 13h2M15 14h2" />
    </>
  )
};

export function Icon({ name, className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}

/** Chevron del breadcrumb: separador, no un icono de contenido. */
export function ChevronRightIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      <path d="m9.5 6 6 6-6 6" />
    </svg>
  );
}

export function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

export function MenuIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false" className={className}>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
    </svg>
  );
}

export function CloseIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false" className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

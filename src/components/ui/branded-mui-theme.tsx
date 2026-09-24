"use client";

import { useMemo, type ReactNode } from "react";
import { createTheme, ThemeProvider, type SxProps, type Theme } from "@mui/material/styles";
import { DEFAULT_PRIMARY_COLOR, DEFAULT_SECONDARY_COLOR } from "@/lib/branding/identity";

export function BrandedMuiThemeProvider({ children }: { children: ReactNode }) {
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          primary: {
            main: DEFAULT_PRIMARY_COLOR,
            light: "#419095",
            dark: "#0e4f53",
            contrastText: "#ffffff"
          },
          secondary: {
            main: DEFAULT_SECONDARY_COLOR,
            light: "#fce8b3",
            dark: "#bf8b01",
            contrastText: "#241a00"
          },
          background: {
            default: "#dde6e3",
            paper: "#ffffff"
          },
          text: {
            primary: "#171d1d",
            secondary: "#3f4949"
          }
        },
        shape: { borderRadius: 8 },
        typography: { fontFamily: "inherit" },
        components: {
          MuiButton: {
            styleOverrides: {
              root: ({ ownerState }) => ({
                textTransform: "none",
                fontWeight: 700,
                ...(ownerState.color === "primary" && ownerState.variant === "contained"
                  ? {
                      backgroundColor: "var(--md-primary)",
                      color: "var(--md-on-primary)",
                      "&:hover": {
                        backgroundColor: "var(--brand-primary-strong)"
                      }
                    }
                  : {}),
                ...(ownerState.color === "primary" && ownerState.variant === "outlined"
                  ? {
                      borderColor: "var(--md-primary)",
                      color: "var(--md-primary)",
                      "&:hover": {
                        borderColor: "var(--brand-primary-strong)",
                        backgroundColor: "var(--brand-primary-hover-surface)"
                      }
                    }
                  : {}),
                ...(ownerState.color === "primary" && ownerState.variant === "text"
                  ? {
                      color: "var(--md-primary)",
                      "&:hover": {
                        backgroundColor: "var(--brand-primary-hover-surface)"
                      }
                    }
                  : {})
              })
            }
          },
          MuiChip: {
            styleOverrides: {
              root: ({ ownerState }) => ({
                ...(ownerState.color === "primary" && ownerState.variant !== "outlined"
                  ? {
                      backgroundColor: "var(--md-primary)",
                      color: "var(--md-on-primary)"
                    }
                  : {}),
                ...(ownerState.color === "primary" && ownerState.variant === "outlined"
                  ? {
                      borderColor: "var(--md-primary)",
                      color: "var(--md-primary)"
                    }
                  : {})
              })
            }
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                boxShadow: "var(--md-elevation-2)"
              }
            }
          }
        }
      }),
    []
  );

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

export const brandedTablePaperSx: SxProps<Theme> = {
  border: "1px solid var(--line)",
  borderRadius: "8px",
  overflow: "hidden",
  width: "100%",
  maxWidth: "100%"
};

export function brandedTableContainerSx(maxHeight: string): SxProps<Theme> {
  return {
    maxHeight,
    backgroundColor: "var(--md-surface-container-lowest)",
    width: "100%"
  };
}

export const brandedTableHeadCellSx: SxProps<Theme> = {
  backgroundColor: "var(--md-surface-container-low)",
  color: "var(--md-on-surface)",
  fontSize: 12,
  fontWeight: 800
};

export const brandedTableBodyCellSx: SxProps<Theme> = {
  borderColor: "var(--line)",
  fontSize: 13
};

export const mutedTextSx: SxProps<Theme> = {
  color: "var(--md-on-surface-variant)"
};

export type DeliveryRowAlert = "overdue" | "due_soon" | null | undefined;

/**
 * Resalta una fila entera, columnas fijas incluidas.
 *
 * MRT pinta las celdas fijas con un `::before` en z-index -1 y opacidad 0.97
 * sobre el color base de la tabla. Ese pseudo-elemento tapa el `background` que
 * la fila pone en el `td`, pero no al texto: las columnas fijas se quedaban
 * blancas con letra blanca. Hay que pintar tambien el `::before`.
 *
 * Los colores salen de los roles "container" del sistema, no de hexadecimales
 * sueltos: sobre un fondo tenue con texto oscuro los Chip de MUI que viven
 * dentro de la fila siguen siendo legibles, cosa que no pasaba sobre el rojo
 * saturado con texto forzado a blanco.
 */
export function deliveryAlertRowSx(alert: DeliveryRowAlert): SxProps<Theme> | undefined {
  if (alert === "overdue") {
    return alertRowSx("var(--fila-vencida)", "var(--fila-vencida-hover)", "var(--md-on-error-container)", "var(--md-error)");
  }

  if (alert === "due_soon") {
    return alertRowSx("var(--fila-por-vencer)", "var(--fila-por-vencer-hover)", "var(--md-on-tertiary-container)", "var(--md-tertiary)");
  }

  return undefined;
}

function alertRowSx(background: string, hover: string, text: string, accent: string): SxProps<Theme> {
  const accentBar = `inset 4px 0 0 0 ${accent}`;

  return {
    "& > td": { backgroundColor: background, color: text },
    '& > td[data-pinned="true"]::before': { backgroundColor: background },
    "&:hover > td": { backgroundColor: hover, color: text },
    '&:hover > td[data-pinned="true"]::before': { backgroundColor: hover },
    // La barra va en el pseudo-elemento cuando la celda esta fija, porque ese
    // se dibuja por encima del fondo y del borde del propio `td`.
    "& > td:first-of-type": { boxShadow: accentBar },
    '& > td:first-of-type[data-pinned="true"]::before': { boxShadow: accentBar }
  };
}

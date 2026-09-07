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

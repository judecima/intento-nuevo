"use client";

import type { ReactNode } from "react";
import { ThemeProvider as MaterialTailwindProvider } from "@material-tailwind/react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v14-appRouter";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider>
      <MaterialTailwindProvider>{children}</MaterialTailwindProvider>
    </AppRouterCacheProvider>
  );
}

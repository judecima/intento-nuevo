"use client";

import type { ReactNode } from "react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v14-appRouter";

export function AppProviders({ children }: { children: ReactNode }) {
  return <AppRouterCacheProvider>{children}</AppRouterCacheProvider>;
}

import type { Metadata } from "next";
import { AppProviders } from "@/components/layout/app-providers";
import { getPublicPlatformBranding } from "@/lib/branding/public";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getPublicPlatformBranding();

  return {
    title: branding.name,
    description: "Gestion, optimizacion y produccion de cortes de tableros"
  };
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

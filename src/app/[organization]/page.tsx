import { notFound, redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/context";
import { getPublicOrganization } from "@/lib/organizations/public-access";
import { organizationPath, PLATFORM_SLUG, platformPath } from "@/lib/routing/routes";

type OrganizationRootPageProps = {
  params: { organization: string };
};

export default async function OrganizationRootPage({ params }: OrganizationRootPageProps) {
  const slug = params.organization.trim().toLowerCase();

  if (slug === PLATFORM_SLUG) {
    const context = await getCurrentUserContext(PLATFORM_SLUG);
    if (context.user && context.isPlatformAdmin) redirect(platformPath("/dashboard"));
    redirect(platformPath("/login"));
  }

  const organization = await getPublicOrganization(slug).catch(() => null);
  if (!organization) notFound();

  const context = await getCurrentUserContext(organization.slug);
  const membership = context.memberships.find((item) => item.organizationId === organization.id) ?? null;

  if (context.user && membership) {
    redirect(organizationPath(organization.slug, "/dashboard"));
  }

  redirect(organizationPath(organization.slug, "/login"));
}

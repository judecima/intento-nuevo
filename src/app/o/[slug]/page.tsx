import { redirect } from "next/navigation";

type OrganizationEntryPageProps = {
  params: { slug: string };
  searchParams?: { notice?: string | string[] };
};

export default function OrganizationEntryPage({ params, searchParams }: OrganizationEntryPageProps) {
  const notice = first(searchParams?.notice);
  const target = `/${encodeURIComponent(params.slug.trim().toLowerCase())}/login`;
  redirect(notice ? `${target}?error=${encodeURIComponent(notice)}` : target);
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

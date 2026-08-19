import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CustomerOption = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
};

export async function listOrganizationCustomers(organizationId: string): Promise<CustomerOption[]> {
  const supabase = createSupabaseServerClient();
  const { data: members, error: membersError } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role", "customer")
    .eq("active", true);

  if (membersError) throw new Error(`CUSTOMERS_MEMBERS_QUERY_FAILED: ${membersError.message}`);
  const ids = (members ?? []).map((member) => member.user_id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, address")
    .in("id", ids)
    .order("full_name", { ascending: true });

  if (error) throw new Error(`CUSTOMERS_QUERY_FAILED: ${error.message}`);

  return (data ?? []).map((profile) => ({
    id: profile.id,
    fullName: profile.full_name?.trim() || "Sin nombre",
    email: profile.email?.trim() || "",
    phone: profile.phone?.trim() || "",
    address: profile.address?.trim() || ""
  }));
}

export async function customerBelongsToOrganization(customerId: string, organizationId: string): Promise<boolean> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", customerId)
    .eq("role", "customer")
    .eq("active", true)
    .maybeSingle();

  if (error) throw new Error(`CUSTOMER_MEMBERSHIP_QUERY_FAILED: ${error.message}`);
  return Boolean(data);
}

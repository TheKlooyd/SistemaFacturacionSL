import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function resolveAiTenant(admin: SupabaseClient, userId: string) {
  const { data: memberships, error } = await admin.from("negocio_usuarios")
    .select("negocio_id").eq("user_id", userId).eq("is_active", true);
  if (error) throw error;
  if (!memberships || memberships.length !== 1) throw new Error("TENANT_ACCESS_DENIED");
  const negocioId = memberships[0].negocio_id;
  const { data: allowed, error: accessError } = await admin.rpc("business_has_active_subscription", { p_negocio_id: negocioId });
  if (accessError) throw accessError;
  if (!allowed) throw new Error("TENANT_ACCESS_DENIED");
  return negocioId;
}

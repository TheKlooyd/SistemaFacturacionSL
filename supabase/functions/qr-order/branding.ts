import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Only the QR secret identifies the tenant. This lookup never opens a session.
export async function getQrBranding(admin: SupabaseClient, qrHash: string) {
  const { data: qr, error: qrError } = await admin.from("mesa_qr_codes")
    .select("negocio_id").eq("token_hash", qrHash).eq("is_active", true).maybeSingle();
  if (qrError) throw qrError;
  if (!qr?.negocio_id) return { state: "invalid" };

  const { data: allowed, error: accessError } = await admin.rpc("business_has_active_subscription", { p_negocio_id: qr.negocio_id });
  if (accessError) throw accessError;
  if (!allowed) return { state: "inactive" };

  const { data: negocio, error: negocioError } = await admin.from("negocios")
    .select("nombre,estado").eq("id", qr.negocio_id).maybeSingle();
  if (negocioError) throw negocioError;
  if (!negocio) return { state: "invalid" };
  if (negocio.estado !== "activo") return { state: "inactive" };

  const { data: config, error: configError } = await admin.from("negocio_configuracion")
    .select("nombre_comercial,logo_url").eq("negocio_id", qr.negocio_id).maybeSingle();
  if (configError) throw configError;

  // Public allowlist: no payment instructions, owner details or AI rules.
  return {
    state: "ok",
    branding: {
      name: String(config?.nombre_comercial || "").trim() || String(negocio.nombre || "").trim() || "Mi negocio",
      logoUrl: String(config?.logo_url || "").trim(),
    },
  };
}

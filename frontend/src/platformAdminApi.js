import { supabase } from "./supabaseClient";

export async function callPlatformAdmin(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke("platform-admin", {
    body: { action, ...payload },
  });

  if (error) {
    let message = error.message || "No fue posible contactar la administración.";
    try { const payload = await error.context?.clone?.().json(); if (payload?.error) message = payload.error; } catch { /* Non-JSON gateway response. */ }
    throw new Error(message);
  }

  if (!data?.ok) {
    throw new Error(data?.error || "La operación administrativa falló.");
  }

  return data;
}

export async function getPlatformAdminStatus() {
  return callPlatformAdmin("status");
}

export async function listPlatformBusinesses() {
  const data = await callPlatformAdmin("list_businesses");
  return data.businesses || [];
}

export async function createPlatformBusiness(business) {
  return callPlatformAdmin("create_business", { business });
}

export async function setPlatformBusinessAccess(businessId, active) {
  return callPlatformAdmin("set_business_access", { businessId, active });
}

export async function resetPlatformOwnerPassword(businessId, password) {
  return callPlatformAdmin("reset_owner_password", { businessId, password });
}

export function updatePlatformBusiness(businessId, config) {
  return callPlatformAdmin("update_business", { businessId, config });
}
export function verifyQrManifest(businessId, codes) {
  return callPlatformAdmin("verify_qr_manifest", { businessId, codes });
}

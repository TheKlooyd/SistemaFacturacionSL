import { getActiveTenant } from "./tenantSession";
import { createBusinessBranding, resolveLogoUrl } from "./branding.js";

export function resolveBusinessLogo(logoUrl) {
  return resolveLogoUrl(logoUrl, import.meta.env.BASE_URL);
}

export function getBusinessBranding() {
  const tenant = getActiveTenant();
  return createBusinessBranding(tenant?.negocio, tenant?.configuracion, import.meta.env.BASE_URL);
}

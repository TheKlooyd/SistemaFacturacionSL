import { getActiveTenant } from "./tenantSession";

const BASE = import.meta.env.BASE_URL;

export function resolveBusinessLogo(logoUrl) {
  const value = String(logoUrl || "").trim();

  if (!value) {
    return `${BASE}logoklooyd.png`;
  }

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  ) {
    return value;
  }

  return `${BASE}${value.replace(/^\/+/, "")}`;
}

export function getBusinessBranding() {
  const tenant = getActiveTenant();
  const negocio = tenant?.negocio || {};
  const config = tenant?.configuracion || {};

  return {
    negocioId: negocio.id || "",
    slug: negocio.slug || "",

    name:
      String(config.nombre_comercial || "").trim() ||
      String(negocio.nombre || "").trim() ||
      "Mi negocio",

    logoUrl: resolveBusinessLogo(config.logo_url),

    nit: String(config.nit || "").trim(),
    address: String(config.direccion || "").trim(),
    phone: String(config.telefono || "").trim(),
    paymentInfo: String(config.payment_info || "").trim(),

    timezone: String(
      config.timezone || "America/Bogota"
    ).trim(),

    currency: String(
      config.moneda || "COP"
    )
      .trim()
      .toUpperCase(),

    orderRules: String(
      config.reglas_pedidos || ""
    ).trim(),
  };
}
// Pure helpers shared by the POS and the public QR. No authenticated session here.
export function resolveLogoUrl(logoUrl, base = "/") {
  const root = `${base.replace(/\/+$/, "")}/`;
  const fallback = `${root}logoklooyd.png`;
  const value = String(logoUrl || "").trim();
  if (!value) return fallback;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.includes("\\") || [...value].some((char) => char.charCodeAt(0) < 32) || value.startsWith("//")) return fallback;
  if (value.split("/").includes("..")) return fallback;
  if (value.startsWith(root)) return value;
  return `${root}${value.replace(/^\/+/, "")}`;
}

export function createBusinessBranding(negocio = {}, config = {}, base = "/") {
  negocio = negocio || {};
  config = config || {};
  return {
    negocioId: negocio.id || "",
    slug: negocio.slug || "",
    name: String(config.nombre_comercial || "").trim() || String(negocio.nombre || "").trim() || "Mi negocio",
    logoUrl: resolveLogoUrl(config.logo_url, base),
    nit: String(config.nit || "").trim(),
    address: String(config.direccion || "").trim(),
    phone: String(config.telefono || "").trim(),
    paymentInfo: String(config.payment_info || "").trim(),
    timezone: String(config.timezone || "America/Bogota").trim(),
    currency: String(config.moneda || "COP").trim().toUpperCase(),
    orderRules: String(config.reglas_pedidos || "").trim(),
  };
}

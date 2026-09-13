const fields: Record<string, number> = { nombre_comercial: 160, logo_url: 500, nit: 80, direccion: 240, telefono: 80, payment_info: 500, reglas_pedidos: 20000 };
export function validateBusinessConfig(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Configuración inválida.");
  const result: Record<string, string> = {};
  for (const [field, max] of Object.entries(fields)) {
    const raw = (value as Record<string, unknown>)[field];
    if (typeof raw !== "string" || raw.length > max) throw new Error(`Campo inválido: ${field} (máximo ${max} caracteres).`);
    result[field] = raw.trim();
  }
  if (!result.nombre_comercial) throw new Error("El nombre comercial es obligatorio.");
  const logo = result.logo_url;
  if (logo && !/^https?:\/\//i.test(logo) && !/^[a-z0-9_./-]+\.(png|jpe?g|webp|gif)$/i.test(logo)) throw new Error("Usa una URL http/https o el nombre de un archivo de logo.");
  if (logo.startsWith("//") || logo.split("/").includes("..")) throw new Error("URL del logo inválida.");
  return result;
}

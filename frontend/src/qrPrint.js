import QRCode from "qrcode";
import { resolveLogoUrl } from "./branding.js";
import { openPrintWindow } from "./print.js";
import { verifyQrManifest } from "./platformAdminApi.js";

const esc = value => String(value || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function validateQrManifest(manifest, businessId) {
  if ((manifest?.business?.negocio_id || manifest?.business?.id) !== businessId) throw new Error("El manifiesto pertenece a otro negocio.");
  const codes = manifest.qr_codes;
  if (!Array.isArray(codes) || !codes.length || codes.length > 12) throw new Error("No hay códigos válidos en el manifiesto.");
  const seen = new Set();
  for (const code of codes) {
    if (!Number.isInteger(code.mesa) || code.mesa < 1 || code.mesa > 12 || seen.has(code.mesa)) throw new Error("Número de mesa inválido o repetido.");
    seen.add(code.mesa);
    const url = new URL(code.url);
    if (!["http:", "https:"].includes(url.protocol) || typeof code.token !== "string" || code.token.length < 32 || code.token.length > 256 || url.searchParams.get("qr") !== code.token) throw new Error("Enlace QR inválido.");
  }
  return [...codes].sort((a, b) => a.mesa - b.mesa);
}

export async function printBusinessQrs(business, manifest, existingWindow = null) {
  const codes = validateQrManifest(manifest, business.id);
  // A manifest must not send customers to an unrelated host or application path.
  const allowedOrigins = new Set([window.location.origin, "https://theklooyd.github.io"]);
  for (const code of codes) {
    const url = new URL(code.url);
    if (!allowedOrigins.has(url.origin) || url.pathname.replace(/\/$/, "") !== import.meta.env.BASE_URL.replace(/\/$/, "")) throw new Error("Los QR deben apuntar a la dirección de este sistema. Revisa el manifiesto.");
  }
  const popup = existingWindow || window.open("", "business-qr-print", "width=900,height=900");
  if (!popup) throw new Error("Permite ventanas emergentes para imprimir los QR.");
  popup.document.write("<p>Preparando códigos QR...</p>");
  try {
    await verifyQrManifest(business.id, codes.map(({ mesa, token }) => ({ mesa, token })));
    const config = business.configuracion || {};
    const name = config.nombre_comercial || business.nombre || "Mi negocio";
    const logo = new URL(resolveLogoUrl(config.logo_url, import.meta.env.BASE_URL), window.location.origin).href;
    const cards = await Promise.all(codes.map(async code => `<article><header><img src="${esc(logo)}" alt=""><b>Mesa ${code.mesa}</b></header><h2>${esc(name)}</h2><img class="qr" src="${await QRCode.toDataURL(code.url, { width: 560, margin: 4, errorCorrectionLevel: "M" })}" alt="QR Mesa ${code.mesa}"><p>Escanea para hacer tu pedido</p></article>`));
    const pages = [];
    for (let i = 0; i < cards.length; i += 6) pages.push(`<section>${cards.slice(i, i + 6).join("")}</section>`);
    await openPrintWindow(`<html><head><title>QR ${esc(name)}</title><style>
      @page{size:A4 portrait;margin:10mm}body{margin:0;font:14px Arial;color:#111}
      section{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:88mm;gap:3mm;break-after:page}section:last-child{break-after:auto}
      article{border:1px dashed #888;padding:4mm;box-sizing:border-box;text-align:center;break-inside:avoid;overflow:hidden}
      header{display:flex;justify-content:space-between;align-items:center;height:10mm}header img{max-width:25mm;max-height:10mm}
      h2{font-size:12px;line-height:4mm;height:8mm;overflow:hidden;margin:1mm 0;overflow-wrap:anywhere}.qr{width:50mm;height:50mm}p{margin:1mm 0;font-size:12px}
      </style></head><body>${pages.join("")}</body></html>`, "business-qr-print", popup);
  } catch (error) { popup.close(); throw error; }
}

import { resolveLogoUrl } from "./branding.js";

function formatCOP(n) {
  return new Intl.NumberFormat("es-CO").format(Number(n) || 0);
}

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

function line(name, right) {
  return `<div class="row"><div class="left">${esc(name)}</div><div class="right">${right}</div></div>`;
}

function businessHeader(branding = {}, details = true) {
  const name = String(branding.name || "").trim() || "Mi negocio";
  const logo = branding.logoUrl ? `<img class="businessLogo" src="${esc(resolveLogoUrl(branding.logoUrl))}" alt="${esc(name)}" />` : "";
  return `${logo}<div class="title">${esc(name)}</div>${details ? [
    branding.nit ? `NIT: ${branding.nit}` : "",
    branding.address, branding.phone, branding.paymentInfo,
  ].filter(Boolean).map((value) => `<div class="sub businessDetail">${esc(value)}</div>`).join("") : ""}`;
}

function baseStyles() {
  return `
  <style>
    @page { size: 80mm auto; margin: 4mm 3mm; }
    body { margin:0; font-family: Arial, Helvetica, sans-serif; color:#000; font-size:14px; }
    .businessLogo { display:block; max-width:40mm; max-height:25mm; object-fit:contain; margin:0 auto 6px; }
    .businessDetail { white-space:pre-wrap; overflow-wrap:anywhere; }
    .title { text-align:center; font-weight:800; font-size:20px; margin-bottom:6px; letter-spacing:0.5px; }
    .sub { text-align:center; font-size:13px; opacity:1; margin-bottom:6px; }
    .hr { border-top:1px dashed #555; margin:8px 0; }
    .row { display:flex; justify-content:space-between; gap:6px; font-size:14px; margin:3px 0; line-height:1.4; }
    .left { flex:1; word-break:break-word; }
    .right { white-space:nowrap; }
    .bold { font-weight:800; }
    .small { font-size:13px; opacity:1; }
  </style>`;
}

export function ticketCuenta({ branding, tableName, items, subtotal, tipAmount, discountAmount = 0, totalWithTip, isDelivery = false }) {
  const dt = new Date().toLocaleString("es-CO");

  const itemsHtml = (items || [])
    .map((i) => {
      const qty = Number(i.qty) || 0;
      const unit = Number(i.unit_price) || 0;
      const lineTotal = i.line_total != null ? Number(i.line_total) : unit * qty;
      return `
        ${line(`${qty} x ${i.name || ""}`, `$${formatCOP(lineTotal)}`)}
        <div class="small" style="padding-left:12px;">$${formatCOP(unit)} c/u</div>
        ${i.note ? `<div class="small" style="padding-left:12px;font-style:italic;">↳ ${esc(i.note)}</div>` : ""}
      `;
    })
    .join("");

  return `
  <html><head>${baseStyles()}</head>
  <body>
    ${businessHeader(branding)}
    <div class="sub">${esc(isDelivery ? "🛵 DELIVERY" : tableName)} — ${esc(dt)}</div>
    <div class="hr"></div>

    ${itemsHtml}

    <div class="hr"></div>
    ${line("Subtotal", `$${formatCOP(subtotal)}`)}
    ${discountAmount > 0 ? line("Descuento", `<span style="color:#1a7a40">− $${formatCOP(discountAmount)}</span>`) : ""}
    ${tipAmount > 0 ? line("Propina", `$${formatCOP(tipAmount)}`) : ""}
    <div class="hr"></div>
    <div class="row bold" style="font-size:17px;">
      <div class="left">TOTAL</div>
      <div class="right">$${formatCOP(totalWithTip)}</div>
    </div>
    <div class="hr"></div>
    <div style="text-align:center;font-size:13px;margin-top:6px;">Gracias por su visita</div>
  </body></html>`;
}

export function ticketComanda({ branding, tableName, createdAt, items }) {
  const dt = new Date(createdAt).toLocaleString("es-CO");
  const itemsHtml = (items || [])
    .map((i) => {
      const noteHtml = i.note ? `<div class="small" style="padding-left:12px;font-style:italic;">↳ ${esc(i.note)}</div>` : "";
      return line(`${i.qty} x ${i.name}`, "") + noteHtml;
    })
    .join("");

  return `
  <html><head>${baseStyles()}</head>
  <body>
    ${businessHeader(branding, false)}
    <div class="title">COMANDA COCINA</div>
    <div class="sub">${esc(tableName)} — ${esc(dt)}</div>
    <div class="hr"></div>
    ${itemsHtml}
    <div class="hr"></div>
    <div class="small">Mini POS</div>
  </body></html>`;
}

export function ticketFactura({
  branding,
  tableName,
  createdAt,
  method,
  paymentSplits,
  items,
  subtotal,
  tipAmount,
  discountAmount = 0,
  totalWithTip,
  paidAmount = 0,
  isDelivery = false,
  deliveryClient = null,
}) {
  const dt = new Date(createdAt).toLocaleString("es-CO");
  const change = Math.max(
    0,
    (Number(paidAmount) || 0) - (Number(totalWithTip) || 0)
  );

  const itemsHtml = (items || [])
    .map((i) => {
      const qty = Number(i.qty) || 0;
      const name = i.name || "";
      const unit = Number(i.unit_price) || 0;
      const lineTotal =
        i.line_total != null ? Number(i.line_total) : unit * qty;

      return `
        ${line(`${qty} x ${name}`, `$${formatCOP(lineTotal)}`)}
        <div class="small">  $${formatCOP(unit)} c/u</div>
        ${i.note ? `<div class="small" style="padding-left:12px;font-style:italic;">↳ ${esc(i.note)}</div>` : ""}
      `;
    })
    .join("");

  const deliveryHtml = isDelivery && deliveryClient
    ? `
    <div class="hr"></div>
    <div class="bold" style="font-size:15px;">DATOS DE ENTREGA</div>
    ${line("Cliente", esc(deliveryClient.name || ""))}
    ${line("Teléfono", esc(deliveryClient.phone || ""))}
    ${line("Dirección", esc(deliveryClient.address || ""))}`
    : isDelivery
    ? `<div class="hr"></div><div class="small">DELIVERY — sin cliente asignado</div>`
    : "";

  return `
  <html><head>${baseStyles()}</head>
  <body>
    ${businessHeader(branding)}

    <div class="hr"></div>
    ${line(`${isDelivery ? "🛵 DELIVERY" : tableName} — ${dt}`, "")}
    ${deliveryHtml}
    <div class="hr"></div>

    ${itemsHtml}

    <div class="hr"></div>
    ${line("Subtotal", `$${formatCOP(subtotal)}`)}
    ${discountAmount > 0 ? line("Descuento", `<span style="color:#1a7a40">− $${formatCOP(discountAmount)}</span>`) : ""}
    ${line("Propina", `$${formatCOP(tipAmount)}`)}
    ${line("TOTAL", `<span class="bold">$${formatCOP(totalWithTip)}</span>`)}
    <div class="hr"></div>
    ${
      paymentSplits && paymentSplits.length > 0
        ? paymentSplits
            .map((s) =>
              line(String(s.method || "").toUpperCase(), `$${formatCOP(s.amount)}`)
            )
            .join("")
        : line("Método", esc(String(method || "N/A").toUpperCase())) +
          line("Pagó", `$${formatCOP(paidAmount)}`)
    }
    ${line("TOTAL PAGADO", `<span class="bold">$${formatCOP(paidAmount)}</span>`)}
    ${change > 0 ? `
    <div class="hr"></div>
    <div class="row bold" style="color:#1a7a40;font-size:16px;background:#e8f8ee;padding:6px 8px;border-radius:4px;margin:4px 0;">
      <div class="left">CAMBIO</div>
      <div class="right">$${formatCOP(change)}</div>
    </div>` : ""}
    <div class="hr"></div>

    <div style="text-align:center;font-size:14px;margin-top:4px;">Gracias por su compra</div>
  </body></html>`;
}

export function ticketCierre({ branding, dateISO, summary, breakdown, topProducts }) {
  const dt = new Date().toLocaleString("es-CO");

  const breakdownTotal = (breakdown || []).reduce((s, b) => s + Number(b.total || 0), 0);
  const total = Number(summary?.total ?? breakdownTotal);

  const byMethod = (breakdown || [])
    .map((b) => {
      const uses = Number(b.uses ?? b.tickets ?? 0);
      return line(`${b.method} (${uses} uso${uses !== 1 ? "s" : ""})`, `$${formatCOP(b.total)}`);
    })
    .join("");

  const top = (topProducts || [])
    .map((p) => line(`${p.qty} x ${p.name}`, `$${formatCOP(p.total)}`))
    .join("");

  return `
  <html><head>${baseStyles()}</head>
  <body>
    ${businessHeader(branding, false)}
    <div class="title">CIERRE DIARIO</div>
    <div class="sub">${esc(dateISO)} — Impreso: ${esc(dt)}</div>
    <div class="hr"></div>

    ${line("Tickets", String(summary?.tickets || 0))}
    ${line("Subtotal", `$${formatCOP(summary?.subtotal || 0)}`)}
    ${line("Propinas", `$${formatCOP(summary?.tip || 0)}`)}
    ${line("TOTAL", `<span class="bold">$${formatCOP(total)}</span>`)}

    <div class="hr"></div>
    <div class="bold">Por método</div>
    ${byMethod || `<div class="small">Sin datos</div>`}

    <div class="hr"></div>
    <div class="bold">Top productos</div>
    ${top || `<div class="small">Sin datos</div>`}

    <div class="hr"></div>
    <div class="small">Mini POS</div>
  </body></html>`;
}



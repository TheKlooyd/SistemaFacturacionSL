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

function baseStyles() {
  return `
  <style>
    @page { size: 80mm auto; margin: 6mm; }
    body { margin:0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color:#111; }
    .title { text-align:center; font-weight:800; font-size:16px; margin-bottom:6px; }
    .sub { text-align:center; font-size:12px; opacity:.8; margin-bottom:10px; }
    .hr { border-top:1px dashed #999; margin:8px 0; }
    .row { display:flex; justify-content:space-between; gap:10px; font-size:12px; margin:2px 0; }
    .left { flex:1; }
    .right { white-space:nowrap; }
    .bold { font-weight:800; }
    .small { font-size:11px; opacity:.85; }
  </style>`;
}

export function ticketComanda({ tableName, createdAt, items }) {
  const dt = new Date(createdAt).toLocaleString("es-CO");
  const itemsHtml = (items || [])
    .map((i) => line(`${i.qty} x ${i.name}`, ""))
    .join("");

  return `
  <html><head>${baseStyles()}</head>
  <body>
    <div class="title">COMANDA COCINA</div>
    <div class="sub">${esc(tableName)} — ${esc(dt)}</div>
    <div class="hr"></div>
    ${itemsHtml}
    <div class="hr"></div>
    <div class="small">Mini POS</div>
  </body></html>`;
}

export function ticketFactura({
  businessName = "SABOR LATINO",
  nit = "",
  address = "",
  phone = "",
  tableName,
  createdAt,
  method,
  items,
  subtotal,
  tipAmount,
  totalWithTip,
  paidAmount = 0,
}) {
  const dt = new Date(createdAt).toLocaleString("es-CO");
  const change = Math.max(
    0,
    (Number(paidAmount) || 0) - (Number(totalWithTip) || 0)
  );

  const itemsHtml = (items || [])
    .map((i) => {
      const qty = Number(i.qty) || 0;
      const name = esc(i.name || "");
      const unit = Number(i.unit_price) || 0;
      const lineTotal =
        i.line_total != null ? Number(i.line_total) : unit * qty;

      return `
        ${line(`${qty} x ${name}`, `$${formatCOP(lineTotal)}`)}
        <div class="small">  $${formatCOP(unit)} c/u</div>
      `;
    })
    .join("");

  return `
  <html><head>${baseStyles()}</head>
  <body>
    <div class="title">${esc(businessName)}</div>
    ${nit ? `<div class="sub">NIT: ${esc(nit)}</div>` : ""}
    ${address ? `<div class="sub">${esc(address)}</div>` : ""}
    ${phone ? `<div class="sub">${esc(phone)}</div>` : ""}

    <div class="hr"></div>
    ${line(`${tableName} — ${dt}`, "")}
    <div class="hr"></div>

    ${itemsHtml}

    <div class="hr"></div>
    ${line("Subtotal", `$${formatCOP(subtotal)}`)}
    ${line("Propina", `$${formatCOP(tipAmount)}`)}
    ${line("TOTAL", `<span class="bold">$${formatCOP(totalWithTip)}</span>`)}
    <div class="hr"></div>
    ${line("Método", esc(String(method || "N/A").toUpperCase()))}
    ${line("Pagó", `$${formatCOP(paidAmount)}`)}
    ${line("Cambio", `$${formatCOP(change)}`)}
    <div class="hr"></div>

    <div class="small" style="text-align:center;">Gracias por su compra</div>
  </body></html>`;
}

export function ticketCierre({ dateISO, summary, breakdown, topProducts, ticketsCount }) {
  const dt = new Date().toLocaleString("es-CO");

  const byMethod = (breakdown || [])
    .map((b) => line(`${b.method} (${b.tickets})`, `$${formatCOP(b.total)}`))
    .join("");

  const top = (topProducts || [])
    .map((p) => line(`${p.qty} x ${p.name}`, `$${formatCOP(p.total)}`))
    .join("");

  return `
  <html><head>${baseStyles()}</head>
  <body>
    <div class="title">CIERRE DIARIO</div>
    <div class="sub">${esc(dateISO)} — Impreso: ${esc(dt)}</div>
    <div class="hr"></div>

    ${line("Tickets", String(ticketsCount || 0))}
    ${line("Subtotal", `$${formatCOP(summary?.subtotal || 0)}`)}
    ${line("Propinas", `$${formatCOP(summary?.tip || 0)}`)}
    ${line("TOTAL", `<span class="bold">$${formatCOP(summary?.total || 0)}</span>`)}

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



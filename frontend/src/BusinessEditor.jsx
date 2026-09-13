import { useState } from "react";
import { updatePlatformBusiness } from "./platformAdminApi";

const fields = [
  ["nombre_comercial", "Nombre comercial", 160], ["logo_url", "URL o archivo del logo", 500],
  ["nit", "NIT", 80], ["direccion", "Dirección", 240], ["telefono", "Teléfono", 80],
  ["payment_info", "Instrucciones de pago", 500], ["reglas_pedidos", "Reglas de interpretación de pedidos", 20000],
];
export default function BusinessEditor({ business, onSaved, onCancel }) {
  const [form, setForm] = useState(() => Object.fromEntries(fields.map(([key]) => [key, business.configuracion?.[key] || (key === "nombre_comercial" ? business.nombre : "")])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try { await updatePlatformBusiness(business.id, form); await onSaved(); }
    catch (e) { setError(e.message || "No fue posible guardar."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} style={{ display: "grid", gap: 12 }}>
    <h4 style={{ margin: 0 }}>Editar negocio</h4>
    {fields.map(([key, label, max]) => <label key={key} style={{ display: "grid", gap: 5 }}>
      <span>{label}</span>
      {key === "payment_info" || key === "reglas_pedidos"
        ? <textarea rows={key === "reglas_pedidos" ? 7 : 3} maxLength={max} value={form[key]} disabled={busy} onChange={e => setForm({ ...form, [key]: e.target.value })} />
        : <input required={key === "nombre_comercial"} maxLength={max} value={form[key]} disabled={busy} onChange={e => setForm({ ...form, [key]: e.target.value })} />}
    </label>)}
    {error && <p role="alert" style={{ color: "#970000" }}>{error}</p>}
    <small>El POS cargará los cambios al volver a iniciar sesión. Los QR los mostrarán al abrirse de nuevo.</small>
    <button type="submit" disabled={busy}>{busy ? "Guardando..." : "Guardar cambios"}</button>
    <button type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
  </form>;
}

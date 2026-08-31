import { useEffect, useRef, useState } from "react";
import { newSecret, qrOrder } from "./qrOrderApi";

const storageKey = (qrToken) => `sabor-latino-qr-session:${qrToken}`;
const money = (value) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value || 0);

export default function CustomerQrOrderView({ qrToken }) {
  const [state, setState] = useState({ phase: "loading" });
  const sessionToken = useRef(localStorage.getItem(storageKey(qrToken)) || newSecret());
  const idempotencyKey = useRef(crypto.randomUUID());
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let cancelled = false;
    void qrOrder("start", { qrToken, sessionToken: sessionToken.current }).then((result) => {
      if (cancelled) return;
      if (result.state === "ok") { localStorage.setItem(storageKey(qrToken), sessionToken.current); setState({ phase: "draft", ...result }); }
      else setState({ phase: result.state });
    }).catch((error) => !cancelled && setState({ phase: "error", message: error.message }));
    return () => { cancelled = true; };
  }, [qrToken]);

  async function review() {
    if (!text.trim() || state.phase !== "draft") return;
    setState((current) => ({ ...current, phase: "reviewing" }));
    try { const result = await qrOrder("preview", { sessionToken: sessionToken.current, text }); setPreview(result); setState((current) => ({ ...current, phase: "draft" })); }
    catch (error) { setState({ phase: "error", message: error.message }); }
  }
  async function submit() {
    if (!preview || state.phase !== "draft") return;
    setState((current) => ({ ...current, phase: "submitting" }));
    try { const result = await qrOrder("submit", { sessionToken: sessionToken.current, idempotencyKey: idempotencyKey.current }); if (result.state === "submitted") { setState({ phase: "submitted", mesa_number: state.mesa_number }); localStorage.removeItem(storageKey(qrToken)); } else setState({ phase: result.state }); }
    catch (error) { setState({ phase: "error", message: error.message }); }
  }
  const message = { invalid: "Este código no está disponible.", inactive: "Esta mesa no está disponible en este momento.", occupied: "Esta mesa ya tiene un pedido en curso. Para agregar o modificar productos, llama a un mesero.", draft_elsewhere: "Ya existe una sesión activa para esta mesa desde otro dispositivo.", expired: "Tu borrador venció. Escanea nuevamente el código QR para empezar un pedido.", submitted: "Tu pedido fue enviado correctamente. Para agregar o modificar productos, llama a un mesero." }[state.phase];
  return <main className="qrCustomerPage"><section className="qrCustomerPanel"><img src={`${import.meta.env.BASE_URL}saborlatinologo.png`} alt="Sabor Latino" className="qrLogo" />{state.phase === "loading" ? <p>Cargando mesa...</p> : message ? <><h1>{state.phase === "submitted" ? "Pedido enviado" : "Pedido no disponible"}</h1><p>{message}</p></> : state.phase === "error" ? <><h1>No fue posible continuar</h1><p>{state.message}</p></> : <><p className="qrTable">Mesa {state.mesa_number}</p><h1>Haz tu pedido</h1><textarea className="input qrTextarea" value={text} maxLength={1500} onChange={(event) => { setText(event.target.value); setPreview(null); }} placeholder="Ej: una pizza grande hawaiana y una gaseosa familiar de manzana" disabled={state.phase !== "draft"} />{preview && <div className="qrPreview"><h2>Revisa tu pedido</h2>{preview.items.map((item, index) => <div className="qrLine" key={`${item.product_id}-${item.note}-${index}`}><span>{item.qty} x {item.name}{item.note ? ` (${item.note})` : ""}</span><strong>{money(item.unit_price * item.qty)}</strong></div>)}{preview.unmatched?.length > 0 && <p>No incluidos: {preview.unmatched.join(", ")}.</p>}<div className="qrTotal"><span>Total</span><strong>{money(preview.total)}</strong></div></div>}<button className="btnPrimary qrAction" onClick={review} disabled={state.phase !== "draft" || !text.trim()}>{state.phase === "reviewing" ? "Interpretando..." : "Interpretar pedido"}</button>{preview && <button className="btn qrAction" onClick={submit} disabled={state.phase !== "draft"}>{state.phase === "submitting" ? "Enviando..." : "Confirmar y enviar"}</button>}</>}</section></main>;
}
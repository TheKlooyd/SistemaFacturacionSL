import { useEffect, useMemo, useState } from "react";
import "./App.css";

function formatCOP(value) {
  return new Intl.NumberFormat("es-CO").format(value || 0);
}

export default function PayModal({
  open,
  total,
  defaultTipPercent = 10,
  onCancel,
  onConfirm
}) {
  // ⚠️ Hooks SIEMPRE dentro del componente
  const [method, setMethod] = useState(null);
  const [tipAmount, setTipAmount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);

  // Reset cuando se abre
  useEffect(() => {
    if (open) {
      const tip = Math.round((total * defaultTipPercent) / 100);
      setMethod(null);
      setTipAmount(tip);
      setPaidAmount(total + tip);
    }
  }, [open, total, defaultTipPercent]);

  const totalWithTip = useMemo(() => {
    return total + tipAmount;
  }, [total, tipAmount]);

  function changeTipByAmount(value) {
    const num = Number(value) || 0;
    setTipAmount(num);
    setPaidAmount(total + num);
  }

  function changeTipByPercent(percent) {
    const p = Number(percent) || 0;
    const tip = Math.round((total * p) / 100);
    setTipAmount(tip);
    setPaidAmount(total + tip);
  }

  if (!open) return null;

  return (
    <div className="modalOverlay">
      <div className="modalCard">
        <h2>Registrar pago</h2>

        <div className="modalSection">
          <b>Total cuenta:</b> ${formatCOP(total)}
        </div>

        <div className="modalSection">
          <b>Método de pago</b>
          <div className="payMethods">
            {["EFECTIVO", "TARJETA", "TRANSFERENCIA"].map((m) => (
              <button
                key={m}
                className={`btn ${method === m ? "btnPrimary" : ""}`}
                onClick={() => setMethod(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="modalSection">
          <b>Propina</b>

          <div style={{ display: "flex", gap: 10 }}>
            <div>
              <label>%</label>
              <input
                className="input"
                type="number"
                min="0"
                onChange={(e) => changeTipByPercent(e.target.value)}
                placeholder="10"
              />
            </div>

            <div>
              <label>$</label>
              <input
                className="input"
                type="number"
                min="0"
                value={tipAmount}
                onChange={(e) => changeTipByAmount(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="modalSection">
          <b>Total a pagar:</b> ${formatCOP(totalWithTip)}
        </div>

        <div className="modalActions">
          <button className="btn" onClick={onCancel}>
            Cancelar
          </button>

          <button
            className="btnPrimary"
            disabled={!method}
            onClick={() => {
              if (!method) return alert("Selecciona método de pago");

              onConfirm({
                method,
                tipAmount,
                paidAmount,
                totalWithTip
              });
            }}
          >
            Confirmar pago
          </button>
        </div>
      </div>
    </div>
  );
}

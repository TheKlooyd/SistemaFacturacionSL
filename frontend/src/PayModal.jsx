import { useEffect, useMemo, useState } from "react";

function formatCOP(value) {
  return new Intl.NumberFormat("es-CO").format(value || 0);
}

const ALL_METHODS = ["EFECTIVO", "TARJETA", "TRANSFERENCIA"];

const METHOD_ICONS = {
  EFECTIVO: "💵",
  TARJETA: "💳",
  TRANSFERENCIA: "🏦",
};

export default function PayModal({
  open,
  total,
  defaultTipPercent = 10,
  onCancel,
  onConfirm,
}) {
  const [tipAmount, setTipAmount] = useState(0);
  const [splits, setSplits] = useState([{ method: "EFECTIVO", amount: 0 }]);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const totalWithTip = useMemo(() => total + tipAmount, [total, tipAmount]);

  // Reset cuando se abre
  useEffect(() => {
    if (open) {
      const tip = Math.round((total * defaultTipPercent) / 100);
      setTipAmount(tip);
      setSplits([{ method: "EFECTIVO", amount: total + tip }]);
      setShowAddMenu(false);
    }
  }, [open, total, defaultTipPercent]);

  // Actualizar el monto de EFECTIVO cuando cambia la propina
  function changeTipByAmount(value) {
    const tip = Number(value) || 0;
    setTipAmount(tip);
    const newTotal = total + tip;
    setSplits((prev) => {
      // Si solo hay un método, actualizar su monto al nuevo total
      if (prev.length === 1) return [{ ...prev[0], amount: newTotal }];
      return prev;
    });
  }

  function changeTipByPercent(percent) {
    const p = Number(percent) || 0;
    const tip = Math.round((total * p) / 100);
    changeTipByAmount(tip);
  }

  // Métodos disponibles para agregar (los que no están en splits)
  const availableToAdd = ALL_METHODS.filter(
    (m) => m !== "EFECTIVO" && !splits.some((s) => s.method === m)
  );

  function addSplit(method) {
    const currentSum = splits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const remaining = Math.max(0, totalWithTip - currentSum);
    setSplits((prev) => [...prev, { method, amount: remaining }]);
    setShowAddMenu(false);
  }

  function removeSplit(index) {
    setSplits((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSplitAmount(index, value) {
    const num = Number(value) || 0;
    setSplits((prev) =>
      prev.map((s, i) => (i === index ? { ...s, amount: num } : s))
    );
  }

  const totalPaid = useMemo(
    () => splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0),
    [splits]
  );

  const change = Math.max(0, totalPaid - totalWithTip);
  const remaining = totalWithTip - totalPaid;
  const canConfirm = totalPaid >= totalWithTip && splits.length > 0;

  if (!open) return null;

  return (
    <div className="modalOverlay">
      <div className="modalCard">
        <h2>Registrar pago</h2>

        <div className="modalSection">
          <b>Total cuenta:</b> ${formatCOP(total)}
        </div>

        {/* Propina */}
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
                placeholder="0"
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
          <b>Total a pagar:</b>{" "}
          <span style={{ fontSize: "1.1em" }}>${formatCOP(totalWithTip)}</span>
        </div>

        {/* Medios de pago */}
        <div className="modalSection">
          <b>Medios de pago</b>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {splits.map((split, index) => (
              <div key={split.method} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "var(--bg2, #f5f5f5)",
                    borderRadius: 8,
                    padding: "6px 10px",
                  }}
                >
                  <span style={{ minWidth: 130, fontWeight: 600 }}>
                    {METHOD_ICONS[split.method]} {split.method}
                  </span>
                  <span style={{ opacity: 0.6 }}>$</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={split.amount}
                    onChange={(e) => updateSplitAmount(index, e.target.value)}
                    style={{ flex: 1, minWidth: 90 }}
                  />
                  {splits.length > 1 && (
                    <button
                      className="btn"
                      style={{ padding: "2px 8px", fontSize: "0.85em" }}
                      onClick={() => removeSplit(index)}
                      title={`Quitar ${split.method}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
                {split.method === "EFECTIVO" && (
                  <div style={{ fontSize: "0.78em", color: "#888", paddingLeft: 6 }}>
                    Ingrese el monto que entregó el cliente (si pagó de más, se calculará el cambio)
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Botón agregar medio de pago */}
          {availableToAdd.length > 0 && (
            <div style={{ marginTop: 8, position: "relative" }}>
              {showAddMenu ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ alignSelf: "center", fontSize: "0.85em", opacity: 0.7 }}>
                    Agregar:
                  </span>
                  {availableToAdd.map((m) => (
                    <button
                      key={m}
                      className="btn"
                      style={{ fontSize: "0.85em" }}
                      onClick={() => addSplit(m)}
                    >
                      {METHOD_ICONS[m]} {m}
                    </button>
                  ))}
                  <button
                    className="btn"
                    style={{ fontSize: "0.85em", opacity: 0.6 }}
                    onClick={() => setShowAddMenu(false)}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  className="btn"
                  style={{ fontSize: "0.85em" }}
                  onClick={() => setShowAddMenu(true)}
                >
                  + Agregar medio de pago
                </button>
              )}
            </div>
          )}
        </div>

        {/* Resumen de pago */}
        <div
          className="modalSection"
          style={{
            background: canConfirm ? "var(--bg2, #f0f9f0)" : "var(--bg2, #fff8f0)",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Total pagado:</span>
            <b>${formatCOP(totalPaid)}</b>
          </div>
          {remaining > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", color: "#c0392b" }}>
              <span>Pendiente:</span>
              <b>${formatCOP(remaining)}</b>
            </div>
          )}
          {change > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", color: "#27ae60" }}>
              <span>Cambio al cliente:</span>
              <b>${formatCOP(change)}</b>
            </div>
          )}
        </div>

        <div className="modalActions">
          <button className="btn" onClick={onCancel}>
            Cancelar
          </button>

          <button
            className="btnPrimary"
            disabled={!canConfirm}
            onClick={() => {
              onConfirm({
                paymentSplits: splits,
                method: splits.map((s) => s.method).join(" + "),
                tipAmount,
                paidAmount: totalPaid,
                totalWithTip,
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

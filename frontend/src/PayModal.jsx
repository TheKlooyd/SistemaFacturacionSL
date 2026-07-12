import { useMemo, useRef, useState } from "react";

function formatCOP(value) {
  return new Intl.NumberFormat("es-CO").format(value || 0);
}

// Strip formatting and return integer
function parseNum(str) {
  const digits = String(str ?? "").replace(/[^0-9]/g, "");
  return digits === "" ? 0 : parseInt(digits, 10);
}

// Format a raw input string with thousands separators
function handleNumInput(raw) {
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");
  if (digits === "") return "";
  return new Intl.NumberFormat("es-CO").format(parseInt(digits, 10));
}

// Convert number to formatted string for display
function numToStr(num) {
  if (!num && num !== 0) return "";
  return new Intl.NumberFormat("es-CO").format(num);
}

function getDiscountAmount(total, discountType, discountStr) {
  const value = parseNum(discountStr);
  if (discountType === "PERCENT") {
    return Math.round((total * Math.min(value, 100)) / 100);
  }
  return Math.min(value, total);
}

function formatDiscountInput(rawValue, discountType) {
  if (discountType === "PERCENT") {
    const digits = String(rawValue ?? "").replace(/[^0-9]/g, "");
    return digits === "" ? "" : String(Math.min(parseInt(digits, 10), 100));
  }

  return handleNumInput(rawValue);
}

const ALL_METHODS = ["EFECTIVO", "TARJETA", "TRANSFERENCIA"];

const METHOD_ICONS = {
  EFECTIVO: "💵",
  TARJETA: "💳",
  TRANSFERENCIA: "🏦",
};

export default function PayModal({
  total,
  defaultTipPercent = 10,
  onCancel,
  onConfirm,
}) {
  const initialTip = Math.round((total * defaultTipPercent) / 100);

  const [tipStr, setTipStr] = useState(() => numToStr(initialTip));
  const [splits, setSplits] = useState(() => [
    { method: "EFECTIVO", amountStr: numToStr(total + initialTip) },
  ]);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [discountType, setDiscountType] = useState("PERCENT"); // "PERCENT" | "AMOUNT"
  const [discountStr, setDiscountStr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const tipAmount = parseNum(tipStr);

  const discountAmount = useMemo(() => {
    return getDiscountAmount(total, discountType, discountStr);
  }, [discountStr, discountType, total]);

  const afterDiscount = useMemo(() => Math.max(0, total - discountAmount), [total, discountAmount]);

  const totalWithTip = useMemo(() => afterDiscount + tipAmount, [afterDiscount, tipAmount]);

  function syncSingleSplit(nextTotalWithTip) {
    setSplits((prev) => {
      if (prev.length === 1) return [{ ...prev[0], amountStr: numToStr(nextTotalWithTip) }];
      return prev;
    });
  }

  // Actualizar el monto cuando cambia la propina
  function changeTipByAmount(value) {
    const nextTipStr = handleNumInput(value);
    const nextTipAmount = parseNum(nextTipStr);

    setTipStr(nextTipStr);
    syncSingleSplit(afterDiscount + nextTipAmount);
  }

  function changeTipByPercent(percent) {
    const p = parseNum(percent) || 0;
    const tip = Math.round((afterDiscount * p) / 100);
    const nextTipStr = tip > 0 ? numToStr(tip) : "";

    setTipStr(nextTipStr);
    syncSingleSplit(afterDiscount + tip);
  }

  function resetDiscount(nextType) {
    setDiscountType(nextType);
    setDiscountStr("");
    syncSingleSplit(total + tipAmount);
  }

  function changeDiscount(value) {
    const nextDiscountStr = formatDiscountInput(value, discountType);
    const nextDiscountAmount = getDiscountAmount(total, discountType, nextDiscountStr);
    const nextAfterDiscount = Math.max(0, total - nextDiscountAmount);

    setDiscountStr(nextDiscountStr);
    syncSingleSplit(nextAfterDiscount + tipAmount);
  }

  // Métodos disponibles para agregar (los que no están en splits)
  const availableToAdd = ALL_METHODS.filter(
    (m) => m !== "EFECTIVO" && !splits.some((s) => s.method === m)
  );

  function addSplit(method) {
    const currentSum = splits.reduce((s, x) => s + parseNum(x.amountStr), 0);
    const remaining = Math.max(0, totalWithTip - currentSum);
    setSplits((prev) => [...prev, { method, amountStr: remaining > 0 ? numToStr(remaining) : "" }]);
    setShowAddMenu(false);
  }

  function removeSplit(index) {
    setSplits((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSplitAmount(index, value) {
    const formatted = handleNumInput(value);
    setSplits((prev) =>
      prev.map((s, i) => (i === index ? { ...s, amountStr: formatted } : s))
    );
  }

  const totalPaid = useMemo(
    () => splits.reduce((sum, s) => sum + parseNum(s.amountStr), 0),
    [splits]
  );

  const change = Math.max(0, totalPaid - totalWithTip);
  const remaining = totalWithTip - totalPaid;
  const canConfirm = totalPaid >= totalWithTip && splits.length > 0;

  async function handleConfirm() {
    if (!canConfirm || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);

    try {
      await onConfirm({
        paymentSplits: splits.map((s) => ({ ...s, amount: parseNum(s.amountStr) })),
        method: splits.map((s) => s.method).join(" + "),
        tipAmount,
        discountAmount,
        paidAmount: totalPaid,
        totalWithTip,
      });
    } catch (error) {
      console.error("confirm payment error:", error);
      alert("No se pudo registrar el pago. Intenta de nuevo.");
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="modalOverlay">
      <div className="modalCard modalCardScroll">
        <h2>Registrar pago</h2>

        <div className="modalSection">
          <b>Total cuenta:</b> ${formatCOP(total)}
        </div>

        {/* Descuento */}
        <div className="modalSection">
          <b>Descuento</b>
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(0,0,0,.15)" }}>
              <button
                className={discountType === "PERCENT" ? "btnPrimary" : "btn"}
                style={{ borderRadius: 0, padding: "4px 14px", fontSize: "0.9em" }}
                onClick={() => resetDiscount("PERCENT")}
              >
                %
              </button>
              <button
                className={discountType === "AMOUNT" ? "btnPrimary" : "btn"}
                style={{ borderRadius: 0, padding: "4px 14px", fontSize: "0.9em" }}
                onClick={() => resetDiscount("AMOUNT")}
              >
                $
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ opacity: 0.6 }}>{discountType === "PERCENT" ? "%" : "$"}</span>
              <input
                className="input"
                type="text"
                inputMode="numeric"
                value={discountStr}
                onChange={(e) => changeDiscount(e.target.value)}
                placeholder="0"
                style={{ width: 100 }}
              />
            </div>
            {discountAmount > 0 && (
              <span style={{ color: "#27ae60", fontWeight: 600, fontSize: "0.95em" }}>
                − ${formatCOP(discountAmount)} → ${formatCOP(afterDiscount)}
              </span>
            )}
          </div>
        </div>

        {/* Propina */}
        <div className="modalSection">
          <b>Propina</b>
          <div style={{ display: "flex", gap: 10 }}>
            <div>
              <label>%</label>
              <input
                className="input"
                type="text"
                inputMode="numeric"
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, "");
                  changeTipByPercent(digits);
                }}
                placeholder="0"
              />
            </div>
            <div>
              <label>$</label>
              <input
                className="input"
                type="text"
                inputMode="numeric"
                value={tipStr}
                onChange={(e) => changeTipByAmount(e.target.value)}
                placeholder="0"
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
                    type="text"
                    inputMode="numeric"
                    value={split.amountStr}
                    onChange={(e) => updateSplitAmount(index, e.target.value)}
                    placeholder="0"
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
          <button className="btn" onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>

          <button
            className="btnPrimary"
            disabled={!canConfirm || submitting}
            onClick={handleConfirm}
          >
            {submitting ? "Guardando..." : "Confirmar pago"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { loadTables } from "./tablesStore";
import { loadProducts } from "./productsStore";
import { getOpenOrder, setOpenOrder } from "./ordersStore";
import { parseOrderWithAI } from "./aiOrderStore";
import { broadcastMobileOrder } from "./mobileOrderChannel";

export default function MobileOrderView({ onBack }) {
  const [tables, setTables] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedTableId, setSelectedTableId] = useState(null);
  const [orderText, setOrderText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: "success" | "error", message, unmatched? }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [tbls, prods] = await Promise.all([loadTables(), loadProducts()]);
        if (cancelled) return;
        setTables(tbls);
        setProducts(prods);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedTable = useMemo(
    () => tables.find((t) => String(t.id) === String(selectedTableId)) || null,
    [tables, selectedTableId]
  );

  async function handleSubmit() {
    if (submitting) return;

    if (!selectedTableId) {
      setFeedback({ type: "error", message: "Selecciona primero la mesa del cliente." });
      return;
    }

    const trimmed = orderText.trim();
    if (!trimmed) {
      setFeedback({ type: "error", message: "Escribe el pedido antes de enviarlo." });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const lines = await parseOrderWithAI(trimmed, products);

      if (!lines.length) {
        setFeedback({
          type: "error",
          message: "La IA no pudo identificar productos en el pedido. Intenta ser más específico.",
        });
        return;
      }

      const productById = new Map(products.map((p) => [String(p.id), p]));
      const matchedLines = [];
      const unmatched = [];

      for (const line of lines) {
        const product = line.product_id ? productById.get(String(line.product_id)) : null;
        if (product) {
          matchedLines.push({
            product_id: product.id,
            name: product.name,
            unit_price: product.price,
            qty: line.qty,
            note: line.note || "",
          });
        } else {
          unmatched.push(line.unmatched_name || "Producto no identificado");
        }
      }

      if (!matchedLines.length) {
        setFeedback({
          type: "error",
          message: "No se pudo relacionar ningún producto del pedido con el menú. Agrégalo manualmente desde la mesa.",
          unmatched,
        });
        return;
      }

      const current = await getOpenOrder(selectedTableId);
      const nextItems = [...(current.items || [])];

      for (const line of matchedLines) {
        const idx = nextItems.findIndex(
          (x) => x.product_id === line.product_id && (x.note || "") === (line.note || "")
        );
        if (idx >= 0) {
          nextItems[idx] = { ...nextItems[idx], qty: nextItems[idx].qty + line.qty };
        } else {
          nextItems.push(line);
        }
      }

      await setOpenOrder(selectedTableId, {
        ...current,
        items: nextItems,
        openedAt: current.openedAt || new Date().toISOString(),
      });

      broadcastMobileOrder({
        tableId: selectedTableId,
        tableName: selectedTable?.name || `Mesa ${selectedTableId}`,
        createdAt: new Date().toISOString(),
        items: matchedLines.map((line) => ({ qty: line.qty, name: line.name, note: line.note || "" })),
      });

      setFeedback({
        type: "success",
        message: `Pedido enviado a ${selectedTable?.name || "la mesa"}.`,
        unmatched,
      });
      setOrderText("");
    } catch (error) {
      console.error("MobileOrderView submit error:", error);
      setFeedback({ type: "error", message: error.message || "Ocurrió un error al enviar el pedido." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>Pedido desde móvil</h1>
        <div className="topbarActions">
          <button className="btn" onClick={onBack}>Volver</button>
        </div>
      </header>

      <div className="mobileOrderLayout">
        <section className="card">
          <div className="panelTitle">1. Selecciona la mesa</div>
          {loading ? (
            <p>Cargando mesas...</p>
          ) : (
            <div className="mobileTableGrid">
              {tables.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`mobileTableChip ${String(selectedTableId) === String(t.id) ? "selected" : ""}`}
                  onClick={() => setSelectedTableId(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="panelTitle">2. Escribe el pedido</div>
          <textarea
            className="input mobileOrderTextarea"
            rows={6}
            placeholder='Ej: "Pizza grande mitad hawaiana mitad mexicana y una coca cola 1.5 litros"'
            value={orderText}
            onChange={(e) => setOrderText(e.target.value)}
          />

          {feedback && (
            <div className={`mobileFeedback ${feedback.type}`}>
              <div>{feedback.message}</div>
              {feedback.unmatched?.length > 0 && (
                <ul>
                  {feedback.unmatched.map((name, idx) => (
                    <li key={idx}>No identificado: {name}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button
            type="button"
            className="btnPrimary mobileSubmitButton"
            onClick={handleSubmit}
            disabled={submitting || loading}
          >
            {submitting ? "Enviando..." : "Enviar pedido"}
          </button>
        </section>
      </div>
    </div>
  );
}

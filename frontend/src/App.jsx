import { useEffect, useState } from "react";
import "./App.css";

import ProductAdmin from "./ProductAdmin";
import TableOrder from "./TableOrder";
import DailyReport from "./DailyReport";

import { getOpenOrder } from "./ordersStore";
import { loadTables as getStoredTables } from "./tablesStore";

const BASE = import.meta.env.BASE_URL;

export default function App() {
  // Hooks arriba siempre
  const [view, setView] = useState("tables"); // "tables" | "products" | "order" | "report"
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState(null);

  function isTableBusy(tableId) {
    const order = getOpenOrder(String(tableId));
    return (order?.items?.length || 0) > 0;
  }

  function loadTables() {
    setLoading(true);
    setTables(getStoredTables());
    setLoading(false);
  }

  useEffect(() => {
    if (view === "tables") loadTables();
  }, [view]);

  // Vistas condicionales (después de hooks)
  if (view === "products") {
    return (
      <div className="page">
        <ProductAdmin onBack={() => setView("tables")} />
      </div>
    );
  }

  if (view === "report") {
    return (
      <div className="page">
        <DailyReport onBack={() => setView("tables")} />
      </div>
    );
  }

  if (view === "order" && selectedTable) {
    return (
      <div className="page">
        <TableOrder
          table={selectedTable}
          onBack={() => setView("tables")}
          onPaid={() => {
            loadTables();
            setView("tables");
          }}
        />
      </div>
    );
  }

  // Vista Mesas
  return (
    <div className="page">
      <header className="topbar">
        <img src={`${BASE}saborlatinologo.png`} className="topbarLogo" alt="Sabor Latino" />

        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={() => setView("products")}>
            Admin productos
          </button>

          <button className="btn" onClick={loadTables}>
            Refrescar
          </button>

          <button className="btn" onClick={() => setView("report")}>
            Cierre diario
          </button>
        </div>
      </header>

      {loading ? (
        <p>Cargando mesas...</p>
      ) : (
        <div className="grid">
          {tables.map((t) => {
            const busy = isTableBusy(t.id);

            return (
              <button
                key={t.id}
                className={`tableCard ${busy ? "busy" : "free"}`}
                onClick={() => {
                  setSelectedTable(t);
                  setView("order");
                }}
                title="Click para abrir cuenta"
              >
                <img src={`${BASE}MesaIcono.png`} className="tableIcon" alt="mesa" />
                <div className="tableName">{t.name}</div>
                <div className="tableStatus">{busy ? "Ocupada" : "Libre"}</div>
              </button>
            );
          })}
        </div>
      )}

      <footer className="footer">
        Tip: click en una mesa para abrir la cuenta.
      </footer>
    </div>
  );
}

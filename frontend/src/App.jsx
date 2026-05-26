import { useEffect, useState } from "react";
import "./App.css";

import ProductAdmin from "./ProductAdmin";
import ClientAdmin from "./ClientAdmin";
import TableOrder from "./TableOrder";
import DailyReport from "./DailyReport";
import InvoiceAdmin from "./InvoiceAdmin";

import { loadTables } from "./tablesStore";
import { getAllOpenOrders } from "./ordersStore";

const BASE = import.meta.env.BASE_URL;

export default function App() {
  const [view, setView] = useState("tables");
  const [tables, setTables] = useState([]);
  const [ordersMap, setOrdersMap] = useState({}); // { tableId: orderObj }
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState(null);

  function isTableBusy(tableId) {
    const order = ordersMap[String(tableId)];
    return (order?.items?.length || 0) > 0;
  }

  async function refreshTables() {
    setLoading(true);
    const [tbls, orders] = await Promise.all([loadTables(), getAllOpenOrders()]);
    setTables(tbls);
    setOrdersMap(orders);
    setLoading(false);
  }

  useEffect(() => {
    if (view === "tables") refreshTables();
  }, [view]);

  // Vistas condicionales (después de hooks)
  if (view === "products") {
    return (
      <div className="page">
        <ProductAdmin onBack={() => setView("tables")} />
      </div>
    );
  }

  if (view === "clients") {
    return (
      <div className="page">
        <ClientAdmin onBack={() => setView("tables")} />
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

  if (view === "invoices") {
    return (
      <div className="page">
        <InvoiceAdmin onBack={() => setView("tables")} />
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
            refreshTables();
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

          <button className="btn" onClick={() => setView("clients")}>
            Admin clientes
          </button>

          <button className="btn" onClick={refreshTables}>
            Refrescar
          </button>

          <button className="btn" onClick={() => setView("invoices")}>
            Admin facturas
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

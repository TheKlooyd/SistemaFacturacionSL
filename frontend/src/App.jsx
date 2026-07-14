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

function HomeActionButton({ label, title, onClick, tone, children }) {
  return (
    <button
      type="button"
      className="homeActionButton"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        "--action-tint": tone.tint,
        "--action-border": tone.border,
        "--action-glow": tone.glow,
      }}
    >
      <span className="homeActionGlyph" aria-hidden="true">
        {children}
      </span>
      <span className="homeActionLabel">{label}</span>
    </button>
  );
}

function ProductsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <path d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z" />
      <path d="M3 7.5v9L12 21l9-4.5v-9" />
      <path d="M12 12v9" />
    </svg>
  );
}

function ClientsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <path d="M15 18a4.5 4.5 0 0 1 4.5 4.5" />
      <path d="M4.5 22.5A4.5 4.5 0 0 1 9 18h3" />
      <circle cx="9" cy="8" r="3.5" />
      <path d="M17.5 6.5a2.5 2.5 0 1 1 0 5" />
      <path d="M15.5 13.5a3.5 3.5 0 0 1 3.5 3.5" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M6.5 9A7 7 0 0 1 18 11" />
      <path d="M17.5 15A7 7 0 0 1 6 13" />
    </svg>
  );
}

function InvoicesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <path d="M7 3.5h8l4 4v13l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4v-17Z" />
      <path d="M10 9h5" />
      <path d="M10 13h5" />
      <path d="M10 17h3" />
      <path d="M15 3.5v4h4" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <path d="M5 4.5h14v15H5z" />
      <path d="M8 2.5v4" />
      <path d="M16 2.5v4" />
      <path d="M5 8.5h14" />
      <path d="M8.5 16.5 11 14l2 1.5 3.5-4" />
    </svg>
  );
}

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
    try {
      const [tbls, orders] = await Promise.all([loadTables(), getAllOpenOrders()]);
      setTables(tbls);
      setOrdersMap(orders);
    } finally {
      setLoading(false);
    }
  }

  function showTables() {
    setView("tables");
    void refreshTables();
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [tbls, orders] = await Promise.all([loadTables(), getAllOpenOrders()]);
        if (cancelled) return;
        setTables(tbls);
        setOrdersMap(orders);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Vistas condicionales (después de hooks)
  if (view === "products") {
    return (
      <div className="page">
        <ProductAdmin onBack={showTables} />
      </div>
    );
  }

  if (view === "clients") {
    return (
      <div className="page">
        <ClientAdmin onBack={showTables} />
      </div>
    );
  }

  if (view === "report") {
    return (
      <div className="page">
        <DailyReport onBack={showTables} />
      </div>
    );
  }

  if (view === "invoices") {
    return (
      <div className="page">
        <InvoiceAdmin onBack={showTables} />
      </div>
    );
  }

  if (view === "order" && selectedTable) {
    return (
      <div className="page">
        <TableOrder
          table={selectedTable}
          onBack={showTables}
          onPaid={showTables}
        />
      </div>
    );
  }

  // Vista Mesas
  const homeActions = [
    {
      key: "products",
      label: "Productos",
      title: "Admin productos",
      onClick: () => setView("products"),
      tone: {
        tint: "rgba(254,174,13,.20)",
        border: "rgba(254,174,13,.42)",
        glow: "rgba(254,174,13,.20)",
      },
      icon: <ProductsIcon />,
    },
    {
      key: "clients",
      label: "Clientes",
      title: "Admin clientes",
      onClick: () => setView("clients"),
      tone: {
        tint: "rgba(176,83,40,.18)",
        border: "rgba(176,83,40,.36)",
        glow: "rgba(176,83,40,.18)",
      },
      icon: <ClientsIcon />,
    },
    {
      key: "refresh",
      label: "Refrescar",
      title: "Refrescar mesas",
      onClick: refreshTables,
      tone: {
        tint: "rgba(26,8,0,.08)",
        border: "rgba(26,8,0,.16)",
        glow: "rgba(26,8,0,.12)",
      },
      icon: <RefreshIcon />,
    },
    {
      key: "invoices",
      label: "Facturas",
      title: "Admin facturas",
      onClick: () => setView("invoices"),
      tone: {
        tint: "rgba(205,5,8,.14)",
        border: "rgba(205,5,8,.30)",
        glow: "rgba(205,5,8,.16)",
      },
      icon: <InvoicesIcon />,
    },
    {
      key: "report",
      label: "Cierre",
      title: "Cierre diario",
      onClick: () => setView("report"),
      tone: {
        tint: "rgba(176,83,40,.16)",
        border: "rgba(176,83,40,.34)",
        glow: "rgba(176,83,40,.16)",
      },
      icon: <ReportIcon />,
    },
  ];

  return (
    <div className="page">
      <header className="topbar">
        <img src={`${BASE}saborlatinologo.png`} className="topbarLogo" alt="Sabor Latino" />

        <div className="topbarActions homeActionButtons">
          {homeActions.map((action) => (
            <HomeActionButton
              key={action.key}
              label={action.label}
              title={action.title}
              onClick={action.onClick}
              tone={action.tone}
            >
              {action.icon}
            </HomeActionButton>
          ))}
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

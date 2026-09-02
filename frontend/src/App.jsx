import { useEffect, useState } from "react";
import "./App.css";

import ProductAdmin from "./ProductAdmin";
import ClientAdmin from "./ClientAdmin";
import TableOrder from "./TableOrder";
import DailyReport from "./DailyReport";
import InvoiceAdmin from "./InvoiceAdmin";
import MobileOrderView from "./MobileOrderView";
import MobileOrderNotificationStack from "./MobileOrderNotifications";
import CustomerQrOrderView from "./CustomerQrOrderView";
import StaffAuthGate from "./StaffAuthGate";
import {
  ActionIconButton,
  ClientsIcon,
  ClockIcon,
  InvoicesIcon,
  MobileIcon,
  ProductsIcon,
  RefreshIcon,
  ReportIcon,
} from "./ActionButtons";

import {
  addTable,
  deleteTable,
  getNextAvailableTableNumber,
  loadTables,
  MAX_TABLES,
} from "./tablesStore";
import { getAllOpenOrders } from "./ordersStore";
import { supabase } from "./supabaseClient";
import { subscribeToMobileOrders } from "./mobileOrderChannel";
import { startNotificationSound, stopNotificationSound } from "./notificationSound";
import { openPrintWindow } from "./print";
import { ticketComanda } from "./printTemplates";

const BASE = import.meta.env.BASE_URL;

function formatElapsedClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  return `00:${String(minutes).padStart(2, "0")}`;
}

export function StaffPosApp() {
  const [view, setView] = useState("tables");
  const [tables, setTables] = useState([]);
  const [ordersMap, setOrdersMap] = useState({}); // { tableId: orderObj }
  const [loading, setLoading] = useState(true);
  const [isAddingTable, setIsAddingTable] = useState(false);
  const [deletingTableId, setDeletingTableId] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [mobileNotifications, setMobileNotifications] = useState([]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToMobileOrders((payload) => {
      setMobileNotifications((current) => [...current, { id: crypto.randomUUID(), ...payload }]);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("qr-order-persistence")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ordenes" }, (payload) => {
        const order = payload.new;
        if (order.status !== "OPEN" || order.delivery_client?.source !== "qr") return;
        const tableId = String(order.table_id);
        const items = order.items || [];
        setOrdersMap((current) => ({ ...current, [tableId]: { id: order.id, items, status: order.status, openedAt: order.opened_at } }));
        const table = tables.find((item) => String(item.id) === tableId);
        setMobileNotifications((current) => current.some((notification) => notification.orderId === order.id) ? current : [...current, { id: crypto.randomUUID(), orderId: order.id, tableId, tableName: table?.name || `Mesa ${tableId}`, createdAt: order.opened_at, items: items.map((item) => ({ qty: item.qty, name: item.name, note: item.note || "" })) }]);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [tables]);

  useEffect(() => {
    if (mobileNotifications.length > 0) {
      startNotificationSound();
    } else {
      stopNotificationSound();
    }
  }, [mobileNotifications.length]);

  useEffect(() => stopNotificationSound, []);

  function dismissMobileNotification(id) {
    setMobileNotifications((current) => current.filter((n) => n.id !== id));
  }

  function printMobileNotification(notification) {
    openPrintWindow(
      ticketComanda({
        tableName: notification.tableName,
        createdAt: notification.createdAt,
        items: notification.items,
      }),
      "comanda"
    );
    dismissMobileNotification(notification.id);
  }

  function isTableBusy(tableId) {
    const order = ordersMap[String(tableId)];
    return order?.status === "OPEN";
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

  function requireSecurityKey(actionName) {
    return confirm(`¿Confirmas que deseas ${actionName}?`);
  }

  async function handleAddTable() {
    if (isAddingTable || tables.length >= MAX_TABLES) return;

    setIsAddingTable(true);
    try {
      const nextTables = await addTable();
      if (nextTables.length <= tables.length) {
        alert("No se pudo agregar otra mesa.");
        return;
      }
      setTables(nextTables);
    } finally {
      setIsAddingTable(false);
    }
  }

  async function handleDeleteTable(event, table, busy) {
    event.stopPropagation();

    if (deletingTableId === table.id) return;

    if (busy) {
      alert("No puedes eliminar una mesa que todavía tiene productos facturados o una cuenta abierta.");
      return;
    }

    if (tables.length <= 1) {
      alert("Debe quedar por lo menos una mesa registrada.");
      return;
    }

    if (!confirm(`¿Eliminar ${table.name}? Esta acción quitará la mesa del sistema.`)) {
      return;
    }

    if (!requireSecurityKey(`eliminar ${table.name}`)) {
      return;
    }

    setDeletingTableId(table.id);
    try {
      const nextTables = await deleteTable(table.id);
      const wasDeleted = !nextTables.some((nextTable) => nextTable.id === Number(table.id));

      if (!wasDeleted) {
        alert("No se pudo eliminar la mesa.");
        return;
      }

      setTables(nextTables);
      setOrdersMap((current) => {
        if (!(String(table.id) in current)) return current;
        const next = { ...current };
        delete next[String(table.id)];
        return next;
      });
    } finally {
      setDeletingTableId(null);
    }
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
        <MobileOrderNotificationStack
          notifications={mobileNotifications}
          onDismiss={dismissMobileNotification}
          onPrint={printMobileNotification}
        />
      </div>
    );
  }

  if (view === "clients") {
    return (
      <div className="page">
        <ClientAdmin onBack={showTables} />
        <MobileOrderNotificationStack
          notifications={mobileNotifications}
          onDismiss={dismissMobileNotification}
          onPrint={printMobileNotification}
        />
      </div>
    );
  }

  if (view === "report") {
    return (
      <div className="page">
        <DailyReport onBack={showTables} />
        <MobileOrderNotificationStack
          notifications={mobileNotifications}
          onDismiss={dismissMobileNotification}
          onPrint={printMobileNotification}
        />
      </div>
    );
  }

  if (view === "invoices") {
    return (
      <div className="page">
        <InvoiceAdmin onBack={showTables} />
        <MobileOrderNotificationStack
          notifications={mobileNotifications}
          onDismiss={dismissMobileNotification}
          onPrint={printMobileNotification}
        />
      </div>
    );
  }

  if (view === "mobile") {
    return (
      <div className="page">
        <MobileOrderView onBack={showTables} />
        <MobileOrderNotificationStack
          notifications={mobileNotifications}
          onDismiss={dismissMobileNotification}
          onPrint={printMobileNotification}
        />
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
        <MobileOrderNotificationStack
          notifications={mobileNotifications}
          onDismiss={dismissMobileNotification}
          onPrint={printMobileNotification}
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
      key: "mobile",
      label: "Móvil",
      title: "Tomar pedido desde el móvil",
      onClick: () => setView("mobile"),
      tone: {
        tint: "rgba(26,8,0,.10)",
        border: "rgba(26,8,0,.22)",
        glow: "rgba(26,8,0,.14)",
      },
      icon: <MobileIcon />,
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

  const canAddTable = tables.length < MAX_TABLES;
  const nextTableNumber = getNextAvailableTableNumber(tables);

  return (
    <div className="page">
      <header className="topbar">
        <img src={`${BASE}saborlatinologo.png`} className="topbarLogo" alt="Sabor Latino" />

        <div className="topbarActions homeActionButtons">
          {homeActions.map((action) => (
            <ActionIconButton
              key={action.key}
              label={action.label}
              title={action.title}
              onClick={action.onClick}
              tone={action.tone}
            >
              {action.icon}
            </ActionIconButton>
          ))}
        </div>
      </header>

      {loading ? (
        <p>Cargando mesas...</p>
      ) : (
        <div className="tablesViewport">
          <div className="grid">
            {tables.filter((table) => table.isActive !== false).map((t) => {
              const busy = isTableBusy(t.id);
              const isDeleting = deletingTableId === t.id;
              const openOrder = ordersMap[String(t.id)] || null;
              const waitMs = openOrder?.openedAt
                ? Math.max(0, now - new Date(openOrder.openedAt).getTime())
                : 0;

              return (
                <div key={t.id} className="tableCardShell">
                  <button
                    type="button"
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
                    {busy && openOrder?.openedAt && (
                      <div className="tableTimer">
                        <ClockIcon style={{ width: 14, height: 14 }} />
                        {formatElapsedClock(waitMs)}
                      </div>
                    )}
                  </button>

                  <button
                    type="button"
                    className={`tableDeleteButton ${busy ? "blocked" : ""}`}
                    onClick={(event) => void handleDeleteTable(event, t, busy)}
                    title={
                      busy
                        ? `${t.name} tiene productos; no se puede eliminar todavía`
                        : isDeleting
                          ? `Eliminando ${t.name}`
                          : `Eliminar ${t.name}`
                    }
                    aria-label={
                      busy
                        ? `${t.name} tiene productos; no se puede eliminar todavía`
                        : isDeleting
                          ? `Eliminando ${t.name}`
                          : `Eliminar ${t.name}`
                    }
                  >
                    {isDeleting ? "..." : "×"}
                  </button>
                </div>
              );
            })}

            {canAddTable && nextTableNumber && (
              <button
                type="button"
                className="tableCard tableCardGhost"
                onClick={handleAddTable}
                title={isAddingTable ? "Agregando mesa..." : `Agregar Mesa ${nextTableNumber}`}
                aria-label={isAddingTable ? "Agregando mesa" : `Agregar Mesa ${nextTableNumber}`}
                disabled={isAddingTable}
              >
                <span className="tableIconWrap" aria-hidden="true">
                  <img src={`${BASE}MesaIcono.png`} className="tableIcon" alt="" />
                  <span className="tableGhostPlus">+</span>
                </span>
                <div className="tableName">Mesa {nextTableNumber}</div>
                <div className="tableStatus">
                  {isAddingTable ? "Creando mesa..." : `Agregar mesa · Máx. ${MAX_TABLES}`}
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      <footer className="footer">
        Tip: click en una mesa para abrir la cuenta, usa la tarjeta + para agregar o la X para eliminar mesas vacías.
      </footer>

      <MobileOrderNotificationStack
        notifications={mobileNotifications}
        onDismiss={dismissMobileNotification}
        onPrint={printMobileNotification}
      />
    </div>
  );
}

export default function App() {
  const qrToken = new URLSearchParams(window.location.search).get("qr");
  if (qrToken) return <CustomerQrOrderView qrToken={qrToken} />;
  return <StaffAuthGate><StaffPosApp /></StaffAuthGate>;
}

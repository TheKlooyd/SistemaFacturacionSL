import { lazy, Suspense, useEffect, useState } from "react";
import "./App.css";
import "./Workspace.css";
import WorkspaceShell from "./WorkspaceShell";
import OperationsDashboard from "./OperationsDashboard";

import { getActiveTenant, requireNegocioId } from "./tenantSession";
import { getBusinessBranding } from "./businessBranding";
import { getStationLabels } from "./stationName";
const PlatformAdminApp = lazy(() => import("./PlatformAdminApp"));

const ProductAdmin = lazy(() => import("./ProductAdmin"));
const InventoryAdmin = lazy(() => import("./InventoryAdmin"));
const ClientAdmin = lazy(() => import("./ClientAdmin"));
const SettingsView = lazy(() => import("./SettingsView"));
import TableOrder from "./TableOrder";
const DailyReport = lazy(() => import("./DailyReport"));
const InvoiceAdmin = lazy(() => import("./InvoiceAdmin"));
const MobileOrderView = lazy(() => import("./MobileOrderView"));
import MobileOrderNotificationStack from "./MobileOrderNotifications";
const CustomerQrOrderView = lazy(() => import("./CustomerQrOrderView"));
import StaffAuthGate from "./StaffAuthGate";

import {
  addTable,
  deleteTable,
  loadTables,
  MAX_TABLES,
} from "./tablesStore";

import { getAllOpenOrders } from "./ordersStore";
import { supabase } from "./supabaseClient";
import { subscribeToMobileOrders } from "./mobileOrderChannel";
import {
  startNotificationSound,
  stopNotificationSound,
} from "./notificationSound";
import { openPrintWindow } from "./print";
import { ticketComanda } from "./printTemplates";

export function StaffPosApp() {
  const negocioId = requireNegocioId();
  const branding = getBusinessBranding();
  const activeTenant = getActiveTenant();
  const stationLabels = getStationLabels(activeTenant?.configuracion);
  const [view, setView] = useState("tables");
  const [tables, setTables] = useState([]);
  const [ordersMap, setOrdersMap] = useState({});
  const [loading, setLoading] = useState(true);

  const [
    isAddingTable,
    setIsAddingTable,
  ] = useState(false);

  const [
    deletingTableId,
    setDeletingTableId,
  ] = useState(null);

  const [
    selectedTable,
    setSelectedTable,
  ] = useState(null);

  const [now, setNow] = useState(
    () => Date.now()
  );

  const [
    mobileNotifications,
    setMobileNotifications,
  ] = useState([]);

  useEffect(() => {
    document.title =
      `${branding.name} · Sistema de Facturación`;
  }, [branding.name]);

  useEffect(() => {
    const intervalId =
      window.setInterval(
        () => setNow(Date.now()),
        1000
      );

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const unsubscribe =
      subscribeToMobileOrders(
        (payload) => {
          setMobileNotifications(
            (current) => [
              ...current,
              {
                id: crypto.randomUUID(),
                ...payload,
              },
            ]
          );
        }
      );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(
        `qr-order-persistence:${negocioId}`
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ordenes",
          filter:
            `negocio_id=eq.${negocioId}`,
        },
        (payload) => {
          const order = payload.new;

          if (
            String(order.negocio_id) !==
            String(negocioId)
          ) {
            return;
          }

          if (
            order.status !== "OPEN" ||
            order.delivery_client?.source !==
              "qr"
          ) {
            return;
          }

          const tableId = String(
            order.table_id
          );

          const items =
            order.items || [];

          setOrdersMap(
            (current) => ({
              ...current,
              [tableId]: {
                id: order.id,
                items,
                status: order.status,
                openedAt:
                  order.opened_at,
              },
            })
          );

          const table =
            tables.find(
              (item) =>
                String(item.id) ===
                tableId
            );

          setMobileNotifications(
            (current) =>
              current.some(
                (notification) =>
                  notification.orderId ===
                  order.id
              )
                ? current
                : [
                    ...current,
                    {
                      id:
                        crypto.randomUUID(),

                      orderId:
                        order.id,

                      tableId,

                      tableName:
                        table?.name ||
                        `${stationLabels.singular} ${tableId}`,

                      createdAt:
                        order.opened_at,

                      items:
                        items.map(
                          (item) => ({
                            qty:
                              item.qty,

                            name:
                              item.name,

                            note:
                              item.note ||
                              "",
                          })
                        ),
                    },
                  ]
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(
        channel
      );
    };
  }, [tables, negocioId, stationLabels.singular]);

  useEffect(() => {
    if (
      mobileNotifications.length > 0
    ) {
      startNotificationSound();
    } else {
      stopNotificationSound();
    }
  }, [mobileNotifications.length]);

  useEffect(() => {
    return () => {
      stopNotificationSound();
    };
  }, []);

  function dismissMobileNotification(
    id
  ) {
    setMobileNotifications(
      (current) =>
        current.filter(
          (notification) =>
            notification.id !== id
        )
    );
  }

  function printMobileNotification(
    notification
  ) {
    openPrintWindow(
      ticketComanda({
        branding,
        tableName:
          notification.tableName,

        createdAt:
          notification.createdAt,

        items:
          notification.items,
      }),
      "ticket"
    );

    dismissMobileNotification(
      notification.id
    );
  }

  async function refreshTables() {
    setLoading(true);

    try {
      const [
        loadedTables,
        orders,
      ] = await Promise.all([
        loadTables(),
        getAllOpenOrders(),
      ]);

      setTables(loadedTables);
      setOrdersMap(orders);
    } finally {
      setLoading(false);
    }
  }

  function showTables() {
    setView("tables");
    void refreshTables();
  }

  function requireSecurityKey(
    actionName
  ) {
    return confirm(
      `¿Confirmas que deseas ${actionName}?`
    );
  }

  async function handleAddTable() {
    if (
      isAddingTable ||
      tables.length >= MAX_TABLES
    ) {
      return false;
    }

    setIsAddingTable(true);

    try {
      const nextTables =
        await addTable();

      if (
        nextTables.length <=
        tables.length
      ) {
        return false;
      }

      setTables(nextTables);
      return true;
    } finally {
      setIsAddingTable(false);
    }
  }

  async function handleDeleteTable(
    event,
    table,
    busy
  ) {
    event.stopPropagation();

    if (
      deletingTableId ===
      table.id
    ) {
      return;
    }

    if (busy) {
      alert(
        `No es posible eliminar ${table.name} mientras tenga productos facturados o una cuenta abierta.`
      );

      return;
    }

    if (tables.length <= 1) {
      alert(
        `Debe quedar por lo menos un registro de ${stationLabels.plural.toLowerCase()}.`
      );

      return;
    }

    if (
      !confirm(
        `¿Eliminar ${table.name}? Esta acción quitará este registro del sistema.`
      )
    ) {
      return;
    }

    if (
      !requireSecurityKey(
        `eliminar ${table.name}`
      )
    ) {
      return;
    }

    setDeletingTableId(table.id);

    try {
      const nextTables =
        await deleteTable(
          table.id
        );

      const wasDeleted =
        !nextTables.some(
          (nextTable) =>
            nextTable.id ===
            Number(table.id)
        );

      if (!wasDeleted) {
        alert(
          `No se pudo eliminar ${stationLabels.singular.toLowerCase()}.`
        );

        return;
      }

      setTables(nextTables);

      setOrdersMap(
        (current) => {
          if (
            !(
              String(table.id) in
              current
            )
          ) {
            return current;
          }

          const next = {
            ...current,
          };

          delete next[
            String(table.id)
          ];

          return next;
        }
      );
    } finally {
      setDeletingTableId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [
          loadedTables,
          orders,
        ] = await Promise.all([
          loadTables(),
          getAllOpenOrders(),
        ]);

        if (cancelled) {
          return;
        }

        setTables(loadedTables);
        setOrdersMap(orders);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function navigate(nextView) {
    if (nextView === "tables") showTables();
    else setView(nextView);
  }

  let content;
  switch (view) {
    case "products": content = <ProductAdmin onBack={showTables} />; break;
    case "inventory": content = <InventoryAdmin onBack={showTables} />; break;
    case "clients": content = <ClientAdmin onBack={showTables} />; break;
    case "report": content = <DailyReport onBack={showTables} />; break;
    case "invoices": content = <InvoiceAdmin onBack={showTables} />; break;
    case "mobile": content = <MobileOrderView onBack={showTables} />; break;
    case "settings": content = <div className="page"><SettingsView onBack={showTables} tables={tables} loadingTables={loading} addingTable={isAddingTable} maxTables={MAX_TABLES} onAddTable={handleAddTable} /></div>; break;
    case "order": content = selectedTable && <TableOrder key={selectedTable.id} table={selectedTable} onBack={showTables} onPaid={showTables} />; break;
    default: content = <OperationsDashboard tables={tables} ordersMap={ordersMap} loading={loading} stationLabels={stationLabels} businessType={activeTenant?.configuracion?.tipo_negocio} now={now} deletingTableId={deletingTableId}
      onOpen={table => { setSelectedTable(table); setView("order"); }} onDelete={handleDeleteTable}
      onRefresh={refreshTables} onSettings={() => setView("settings")} onInvoices={() => setView("invoices")} />;
  }

  return (
    <WorkspaceShell branding={branding} view={view} onNavigate={navigate} now={now}>
      <Suspense fallback={<div className="dashboardLoading" role="status"><span className="loadingSpinner" /> Cargando pantalla…</div>}>
        {content}
      </Suspense>
      <MobileOrderNotificationStack notifications={mobileNotifications} onDismiss={dismissMobileNotification} onPrint={printMobileNotification} />
    </WorkspaceShell>
  );
}
function AppRoutes() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const qrToken =
    params.get("qr");

  const normalizedPath =
    window.location.pathname.replace(
      /\/+$/,
      ""
    );

  const isAdminRoute =
    normalizedPath.endsWith(
      "/admin"
    ) ||
    params.get("admin") ===
      "1" ||
    window.location.hash ===
      "#/admin" ||
    window.location.hash ===
      "#admin";

  if (isAdminRoute) {
    return <PlatformAdminApp />;
  }

  if (qrToken) {
    return (
      <CustomerQrOrderView
        qrToken={qrToken}
      />
    );
  }

  return (
    <StaffAuthGate>
      <StaffPosApp />
    </StaffAuthGate>
  );
}

export default function App() {
  return (
    <Suspense fallback={<p role="status" className="page">Cargando pantalla...</p>}>
      <AppRoutes />
    </Suspense>
  );
}

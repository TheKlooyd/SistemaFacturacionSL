import { useState } from "react";
import { ClockIcon, CloseIcon, InvoicesIcon, RefreshIcon, StationIcon } from "./ActionButtons";

const money = value => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
const orderTotal = order => (order?.items || []).reduce((total, item) => total + Number(item.unit_price || 0) * Number(item.qty || 0), 0);

function elapsed(openedAt, now) {
  const minutes = Math.max(0, Math.floor((now - new Date(openedAt).getTime()) / 60000));
  if (!Number.isFinite(minutes)) return "—";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export default function OperationsDashboard({ tables, ordersMap, loading, stationLabels, businessType, now, deletingTableId, onOpen, onDelete, onRefresh, onSettings, onInvoices }) {
  const stationIconUrl = `${import.meta.env.BASE_URL}${businessType === "taller_motos" ? "MotoIcono.png" : "MesaIcono.png"}`;
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const activeTables = tables.filter(table => table.isActive !== false);
  const isBusy = table => ordersMap[String(table.id)]?.status === "OPEN";
  const busyCount = activeTables.filter(isBusy).length;
  const openOrders = Object.values(ordersMap).filter(order => order.status === "OPEN");
  const visibleTables = activeTables.filter(table => (
    (filter === "all" || (filter === "busy" ? isBusy(table) : !isBusy(table))) &&
    table.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es").trim())
  ));
  return (
    <div className="operationsDashboard">
      <section className="stationsSection" aria-label={stationLabels.plural}>
        <div className="stationsHeading"><div><h2>{stationLabels.plural}<span>{activeTables.length}</span></h2></div><button className="btn refreshButton" onClick={onRefresh} disabled={loading}><RefreshIcon />{loading ? "Actualizando…" : "Actualizar"}</button></div>
        <div className="stationsToolbar"><div className="stationFilters" aria-label="Filtrar por estado">{[{ id: "all", label: "Todas", count: activeTables.length }, { id: "busy", label: "En uso", count: busyCount }, { id: "free", label: "Disponibles", count: activeTables.length - busyCount }].map(item => <button key={item.id} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id} className={filter === item.id ? "active" : ""}>{item.label}<span>{item.count}</span></button>)}</div><label className="stationSearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Buscar ${stationLabels.plural.toLowerCase()}…`} aria-label={`Buscar ${stationLabels.plural.toLowerCase()}`} /></label></div>
        {loading ? <div className="dashboardLoading" role="status"><span className="loadingSpinner" /> Cargando tu operación…</div> : <div className="stationGrid">
          {visibleTables.map(table => {
            const busy = isBusy(table);
            const order = ordersMap[String(table.id)];
            const deleting = deletingTableId === table.id;
            const units = (order?.items || []).reduce((total, item) => total + Number(item.qty || 0), 0);
            return <article key={table.id} className={`stationCard${busy ? " occupied" : ""}`}>
              <button className="stationOpen" onClick={() => onOpen(table)} disabled={deleting} aria-label={`${table.name}, ${busy ? "en uso, ver cuenta" : "disponible, abrir cuenta"}`}>
                <span className="stationCardTop"><span className="stationGlyph"><img src={stationIconUrl} alt="" aria-hidden="true" /></span><span className={`stationBadge${busy ? " occupied" : ""}`}><i className="statusDot" />{busy ? "En uso" : "Disponible"}</span></span>
                <span className="stationCardName">{table.name}</span>
                <span className="stationCardDetail">{busy ? `${units} ${units === 1 ? "unidad" : "unidades"} · Cuenta abierta` : "Sin cuenta abierta"}</span>
                <span className="stationCardBottom"><span>{busy ? money(orderTotal(order)) : "Abrir cuenta"}</span><span className="stationArrow" aria-hidden="true">↗</span></span>
              </button>
              <div className="stationMeta"><span>{busy && order.openedAt ? <><ClockIcon /> {elapsed(order.openedAt, now)} h</> : <><span className="stationIndex">{String(table.id).padStart(2, "0")}</span> {busy ? "En atención" : "Lista para atender"}</>}</span><button className="stationDelete" onClick={event => onDelete(event, table, busy)} disabled={busy || deleting} aria-label={`Eliminar ${table.name}`} title={busy ? "No se puede eliminar una cuenta en uso" : `Eliminar ${table.name}`}>{deleting ? "…" : <CloseIcon />}</button></div>
            </article>;
          })}
          {!visibleTables.length && <div className="dashboardEmpty"><StationIcon /><h3>{activeTables.length ? "Sin resultados" : "Tu operación empieza aquí"}</h3><p>{activeTables.length ? "Prueba otro nombre o cambia el filtro de estado." : `Agrega tus ${stationLabels.plural.toLowerCase()} desde Configuración.`}</p><button className="btn" onClick={activeTables.length ? () => { setFilter("all"); setSearch(""); } : onSettings}>{activeTables.length ? "Restablecer filtros" : "Ir a configuración"}</button></div>}
        </div>}
      </section>
      <section className="dashboardMetrics" aria-label="Resumen de operación" aria-busy={loading}>
        <div className="metricCard"><span className="metricLabel">{stationLabels.plural} en total <StationIcon /></span><strong>{loading ? "—" : activeTables.length.toString().padStart(2, "0")}</strong><span className="metricFoot">Tu capacidad de atención</span></div>
        <div className="metricCard"><span className="metricLabel">En uso <ClockIcon /></span><strong>{loading ? "—" : busyCount.toString().padStart(2, "0")}</strong><span className="metricFoot"><i className="statusDot busy" /> Cuentas en curso</span></div>
        <div className="metricCard"><span className="metricLabel">Disponibles <StationIcon /></span><strong>{loading ? "—" : (activeTables.length - busyCount).toString().padStart(2, "0")}</strong><span className="metricFoot"><i className="statusDot" /> Listas para comenzar</span></div>
        <div className="metricCard metricAmount"><span className="metricLabel">Por cobrar <InvoicesIcon /></span><strong>{loading ? "—" : money(openOrders.reduce((total, order) => total + orderTotal(order), 0))}</strong><span className="metricFoot">Valor de las cuentas abiertas</span></div>
      </section>
      <footer className="dashboardFooter"><span><span className="footerCross" aria-hidden="true">＋</span> Selecciona {stationLabels.singular.toLowerCase()} para comenzar o continuar una cuenta.</span><button onClick={onInvoices}>Consultar facturas <span aria-hidden="true">↗</span></button></footer>
    </div>
  );
}

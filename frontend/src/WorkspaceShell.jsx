import BusinessLogo from "./BusinessLogo";
import { getDailyMessage } from "./dailyMessages";
import { ClientsIcon, InventoryIcon, InvoicesIcon, MobileIcon, ProductsIcon, ReportIcon, SettingsIcon, StationIcon } from "./ActionButtons";

const navigation = [
  { key: "tables", label: "Vista general", Icon: StationIcon },
  { key: "products", label: "Productos y servicios", Icon: ProductsIcon },
  { key: "inventory", label: "Inventario", Icon: InventoryIcon },
  { key: "clients", label: "Clientes", Icon: ClientsIcon },
  { key: "invoices", label: "Facturas", Icon: InvoicesIcon },
  { key: "report", label: "Cierre diario", Icon: ReportIcon },
  { key: "mobile", label: "Pedido móvil", Icon: MobileIcon },
  { key: "settings", label: "Configuración", Icon: SettingsIcon },
];

export default function WorkspaceShell({ branding, view, onNavigate, children, now }) {
  const activeView = view === "order" ? "tables" : view;
  const daily = getDailyMessage(now, branding.timezone);
  return (
    <div className="workspace">
      <a className="skipLink" href="#workspace-content">Ir al contenido</a>
      <aside className="workspaceSidebar">
        <button className="workspaceBrand" onClick={() => onNavigate("tables")} aria-label={`${branding.name} · Ir al inicio`} title={branding.name}>
          <BusinessLogo src={branding.logoUrl} name={branding.name} className="workspaceBusinessLogo" />
          <span className="workspaceBusinessName">{branding.name}</span>
        </button>
        <div className="sidebarCaption">ESPACIO DE TRABAJO</div>
        <nav className="workspaceNav" aria-label="Navegación principal">
          {navigation.map(item => {
            const { key, label, Icon } = item;
            return (
            <button key={key} className={`workspaceNavItem${activeView === key ? " active" : ""}`}
              aria-current={activeView === key ? "page" : undefined} onClick={() => onNavigate(key)} title={label}>
              <Icon /><span>{label}</span>{activeView === key && <span className="navIndicator" />}
            </button>
          ); })}
        </nav>
        <div className="sidebarNote"><span className="sidebarNoteMark" aria-hidden="true">↗</span><p>{daily.message}</p></div>
      </aside>
      <div className="workspaceMain">
        <header className="workspaceTopbar">
          <div className="workspaceBreadcrumb"><BusinessLogo src={branding.logoUrl} name="" className="workspaceMobileLogo" /><span className="workspaceTenantName" style={{ color: "var(--muted)" }}>{branding.name}</span><span>/</span> <strong>{view === "order" ? "Cuenta" : navigation.find(item => item.key === view)?.label}</strong></div>
          <div className="workspaceTopbarRight"><time className="workspaceDate" dateTime={daily.dateKey}>{daily.formattedDate}</time></div>
        </header>
        <main id="workspace-content" className={`workspaceContent workspaceView-${view}`} tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}

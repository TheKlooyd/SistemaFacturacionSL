export function ActionIconButton({
  label,
  title,
  onClick,
  tone,
  children,
  className = "",
  style,
  ...props
}) {
  return (
    <button
      type="button"
      className={className ? `homeActionButton ${className}` : "homeActionButton"}
      onClick={onClick}
      title={title || label}
      aria-label={title || label}
      style={{
        "--action-tint": tone.tint,
        "--action-border": tone.border,
        "--action-glow": tone.glow,
        ...style,
      }}
      {...props}
    >
      <span className="homeActionGlyph" aria-hidden="true">
        {children}
      </span>
      <span className="homeActionLabel">{label}</span>
    </button>
  );
}

export function ProductsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <path d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z" />
      <path d="M3 7.5v9L12 21l9-4.5v-9" />
      <path d="M12 12v9" />
    </svg>
  );
}

export function InventoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <path d="M3 5h18v14H3z" />
      <path d="M3 10h18" />
      <path d="M8 5v5" />
      <path d="M16 5v5" />
      <path d="M8 14h3" />
      <path d="M14 14h3" />
    </svg>
  );
}

export function ClientsIcon(props) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" {...props}>
      <path d="M15 18a4.5 4.5 0 0 1 4.5 4.5" />
      <path d="M4.5 22.5A4.5 4.5 0 0 1 9 18h3" />
      <circle cx="9" cy="8" r="3.5" />
      <path d="M17.5 6.5a2.5 2.5 0 1 1 0 5" />
      <path d="M15.5 13.5a3.5 3.5 0 0 1 3.5 3.5" />
    </svg>
  );
}

export function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M6.5 9A7 7 0 0 1 18 11" />
      <path d="M17.5 15A7 7 0 0 1 6 13" />
    </svg>
  );
}

export function InvoicesIcon() {
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

export function ReportIcon() {
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

export function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <circle cx="12" cy="12" r="6.8" />
      <path d="M12 2.75v2.45M12 18.8v2.45M2.75 12H5.2M18.8 12h2.45M5.46 5.46l1.73 1.73M16.81 16.81l1.73 1.73M18.54 5.46l-1.73 1.73M7.19 16.81l-1.73 1.73" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

export function MobileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.2" />
      <path d="M10.5 18.5h3" />
      <path d="M9.5 6.5h5" />
    </svg>
  );
}

export function ClockIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function PrintIcon(props) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" {...props}>
      <path d="M7 8V3.5h10V8" />
      <path d="M7 20.5v-7h10v7" />
      <path d="M6 18.5H5a2 2 0 0 1-2-2v-5A2.5 2.5 0 0 1 5.5 9h13a2.5 2.5 0 0 1 2.5 2.5v5a2 2 0 0 1-2 2h-1" />
      <path d="M9 17h6" />
      <path d="M17 12h.01" />
    </svg>
  );
}

export function StationIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true" {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM13 13h3v3h-3z" />
    </svg>
  );
}

export function PhoneIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true" {...props}>
      <path d="M7.5 3.5h9a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M10 6.5h4M11 17.5h2" />
    </svg>
  );
}

export function LocationIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true" {...props}>
      <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
      <circle cx="12" cy="10" r="2.2" />
    </svg>
  );
}

export function NoteIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true" {...props}>
      <path d="M6 3.5h9l4 4v13H6z" />
      <path d="M15 3.5v4h4M9 12h7M9 16h7" />
    </svg>
  );
}

export function EditIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true" {...props}>
      <path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5Z" />
      <path d="m13.5 7 3.5 3.5" />
    </svg>
  );
}

export function SaveIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true" {...props}>
      <path d="M4 3.5h13l3 3v14H4z" />
      <path d="M8 3.5v6h8v-6M8 20.5v-7h8v7" />
    </svg>
  );
}

export function DeleteIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true" {...props}>
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
    </svg>
  );
}

export function CloseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true" {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function CashIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M6 8h.01M18 16h.01" />
    </svg>
  );
}

export function CardIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 10h18M7 15h4" />
    </svg>
  );
}

export function BankIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true" {...props}>
      <path d="m3 9 9-5 9 5M4 10h16M5 19h14M3 21h18" />
      <path d="M7 10v9M12 10v9M17 10v9" />
    </svg>
  );
}

export function StatusIcon({ kind = "success", ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true" {...props}>
      {kind === "warning" ? (
        <>
          <path d="m12 3 10 18H2L12 3Z" />
          <path d="M12 9v5M12 17h.01" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 2.5 2.5L16 9" />
        </>
      )}
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <path d="M10 6 4 12l6 6" />
      <path d="M4 12h16" />
    </svg>
  );
}

export function PayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
      <path d="M16 15h2" />
    </svg>
  );
}

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

export function ClientsIcon() {
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

export function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <path d="M7 8V3.5h10V8" />
      <path d="M7 20.5v-7h10v7" />
      <path d="M6 18.5H5a2 2 0 0 1-2-2v-5A2.5 2.5 0 0 1 5.5 9h13a2.5 2.5 0 0 1 2.5 2.5v5a2 2 0 0 1-2 2h-1" />
      <path d="M9 17h6" />
      <path d="M17 12h.01" />
    </svg>
  );
}

export function DeliveryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
      <path d="M9 17h6" />
      <path d="M5 17H3.5" />
      <path d="M19 17h1.5" />
      <path d="M9 17 7.5 11h5.7a3 3 0 0 1 2.8 1.9L17.5 17" />
      <path d="M9 11h3.5" />
      <path d="M6 8.5h3" />
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
/** Floating top-left popup stack shown when a mobile order arrives (like an incoming-call toast). */
export default function MobileOrderNotificationStack({ notifications, onDismiss, onPrint }) {
  if (!notifications.length) return null;

  return (
    <div className="mobileNotifyStack">
      {notifications.map((n) => (
        <div key={n.id} className="mobileNotifyToast">
          <div className="mobileNotifyToastHeader">
            <span className="mobileNotifyToastDot" />
            Pedido desde el móvil
          </div>
          <div className="mobileNotifyToastBody">
            Se ha registrado un pedido desde el móvil para <strong>{n.tableName}</strong>.
          </div>
          <div className="mobileNotifyToastActions">
            <button type="button" className="btn" onClick={() => onDismiss(n.id)}>
              Cerrar
            </button>
            <button type="button" className="btnPrimary" onClick={() => onPrint(n)}>
              Imprimir
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

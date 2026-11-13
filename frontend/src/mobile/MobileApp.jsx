import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient.js";
import {
  businessDate,
  centsNumber,
  moneyCents,
  summarizeBreakdown,
  summarizePayments,
} from "../paymentMath.js";
import {
  configurePin,
  enablePush,
  getDeviceId,
  mobileApi,
} from "./mobileApi.js";

function navigate(href) {
  window.history.pushState(null, "", href);
  window.dispatchEvent(new Event("popstate"));
  window.scrollTo(0, 0);
}
function Link({ href, children, ...props }) {
  return (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        if (
          event.button ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}
function useRemote(action, businessId, payload = {}) {
  const key = JSON.stringify([action, businessId, payload]);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState({ key: "", data: null, error: "" });
  useEffect(() => {
    let active = true;
    const [name, id, params] = JSON.parse(key);
    mobileApi(name, id, params)
      .then((data) => {
        if (active) setResult({ key, data, error: "" });
      })
      .catch((error) => {
        if (active) setResult({ key, data: null, error: error.message });
      });
    return () => {
      active = false;
    };
  }, [key, version]);
  const reload = useCallback((keepData = false) => {
    if (keepData !== true) setResult({ key: "", data: null, error: "" });
    setVersion((value) => value + 1);
  }, []);
  return {
    data: result.key === key ? result.data : null,
    error: result.key === key ? result.error : "",
    loading: result.key !== key,
    reload,
  };
}
function Status({ request, children }) {
  if (request.loading)
    return (
      <div className="m-card m-status" role="status">
        Cargando…
      </div>
    );
  if (request.error)
    return (
      <div className="m-card m-status">
        <p role="alert">{request.error}</p>
        <button onClick={request.reload}>Reintentar</button>
      </div>
    );
  return children;
}
function money(value, business) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: business.currency || "COP",
    maximumFractionDigits: 2,
  }).format(Number(value));
}
function dateTime(value, business) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: business.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
function stockLabel(stock) {
  return Number(stock) === 0
    ? "Agotado"
    : Number(stock) <= 2
      ? "Bajo"
      : "Disponible";
}
function localMonth(business) {
  return businessDate(new Date(), business.timezone).slice(0, 7) + "-01";
}
function nextMonth(month, delta) {
  const date = new Date(month + "T12:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 10);
}

function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = event.currentTarget,
      values = new FormData(form);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: String(values.get("email")).trim(),
        password: String(values.get("password")),
      });
      if (error)
        setError(
          "No pudimos iniciar sesión. Comprueba el correo, la contraseña y la conexión.",
        );
    } catch {
      setError("No pudimos conectar. Reintenta en unos momentos.");
    } finally {
      form.elements.password.value = "";
      setBusy(false);
    }
  }
  return (
    <main className="m-login">
      <img className="m-logo" src="/logoklooyd.png" alt="Klooyd" />
      <p className="m-eyebrow">TU NEGOCIO, CONTIGO</p>
      <h1>Todo en un vistazo.</h1>
      <p className="m-muted">Ventas, inventario y alertas para propietarios.</p>
      <form onSubmit={submit} className="m-card">
        <h2>Inicia sesión</h2>
        <label>
          Correo
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Contraseña
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="m-primary" disabled={busy}>
          {busy ? "Entrando…" : "Entrar a mi negocio"}
        </button>
      </form>
    </main>
  );
}

function Chart({ days, business }) {
  const [selected, setSelected] = useState(null);
  const max = Math.max(...days.map((day) => Number(day.sales)), 0);
  const selectedDay = days.find((day) => day.date === selected);
  return (
    <section className="m-card">
      <div className="m-row">
        <h2>Ventas por día</h2>
        <span className="m-muted">Sin propinas</span>
      </div>
      {max === 0 && <p>Este mes no registra ventas.</p>}
      <div
        className="m-chart"
        role="group"
        aria-label="Selecciona un día para consultar su venta"
      >
        {days.map((day, index) => (
          <button
            key={day.date}
            className={selected === day.date ? "selected" : ""}
            aria-pressed={selected === day.date}
            aria-label={`${day.date}: ${money(day.sales, business)}${max > 0 && Number(day.sales) === max ? ", mayor venta" : ""}`}
            onClick={() => setSelected(day.date)}
          >
            <span
              className={
                max > 0 && Number(day.sales) === max ? "m-bar peak" : "m-bar"
              }
              style={{
                height: `${max ? Math.max(2, (Number(day.sales) / max) * 100) : 2}%`,
              }}
            />
            <small>
              {index === 0 ||
              ((index + 1) % 5 === 0 && days.length - 1 - index >= 2) ||
              index === days.length - 1
                ? Number(day.date.slice(-2))
                : ""}
            </small>
          </button>
        ))}
      </div>
      <label className="m-chart-select">
        Consultar día
        <select
          value={selected || ""}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">Selecciona un día</option>
          {days.map((day) => (
            <option key={day.date} value={day.date}>
              {Number(day.date.slice(-2))} · {money(day.sales, business)}
            </option>
          ))}
        </select>
      </label>
      <p className="m-chart-detail" aria-live="polite">
        {selectedDay
          ? `${Number(selectedDay.date.slice(-2))} · ${money(selectedDay.sales, business)} · ${selectedDay.tickets} tickets`
          : "Toca una barra o selecciona un día para ver su detalle."}
      </p>
    </section>
  );
}

function Dashboard({ business, statistics }) {
  const [month, setMonth] = useState(() => localMonth(business));
  const request = useRemote("dashboard", business.id, { month });
  const data = request.data;
  const monthly = data
    ? centsNumber(
        data.days.reduce((sum, day) => sum + moneyCents(day.sales), 0n),
      )
    : 0;
  const tickets = data
    ? data.days.reduce((sum, day) => sum + day.tickets, 0)
    : 0;
  return (
    <>
      <p className="m-eyebrow">{statistics ? "VENTAS" : "MI NEGOCIO"}</p>
      <h1>{statistics ? "Así va tu mes" : "Tu negocio, al día"}</h1>
      <Status request={request}>
        {data && (
          <>
            <div className="m-month">
              <button
                aria-label="Mes anterior"
                disabled={
                  !data.firstDay ||
                  nextMonth(month, -1) < data.firstDay.slice(0, 7) + "-01"
                }
                onClick={() => setMonth(nextMonth(month, -1))}
              >
                ←
              </button>
              <h2>
                {new Intl.DateTimeFormat("es-CO", {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(month + "T12:00:00Z"))}
              </h2>
              <button
                aria-label="Mes siguiente"
                disabled={month >= localMonth(business)}
                onClick={() => setMonth(nextMonth(month, 1))}
              >
                →
              </button>
            </div>
            <div className="m-kpis">
              <div className="m-card m-highlight">
                <span>Ventas del mes</span>
                <strong>{money(monthly, business)}</strong>
                <small>{tickets} tickets · sin propinas</small>
              </div>
              <div className="m-card">
                <span>Ventas históricas</span>
                <strong>{money(data.historical, business)}</strong>
                <small>
                  {data.firstDay
                    ? `Desde ${data.firstDay}`
                    : "Aún no hay pagos"}
                </small>
              </div>
            </div>
            {data.suspectedDuplicates > 0 && (
              <p className="m-notice" role="status">
                {data.suspectedDuplicates} posibles duplicados para revisar en
                el POS. Todos los pagos con ID distinto están incluidos.
              </p>
            )}
            <Chart days={data.days} business={business} />
            <div className="m-shortcuts">
              <Link className="m-card" href="/mobile/inventario?stock=low">
                <strong>{data.lowStock}</strong>Con stock bajo
              </Link>
              <Link className="m-card" href="/mobile/inventario?stock=empty">
                <strong>{data.outOfStock}</strong>Agotados
              </Link>
              <Link className="m-card" href="/mobile/notificaciones">
                <strong>{data.unread}</strong>Alertas sin leer
              </Link>
            </div>
            <section className="m-card">
              <div className="m-row">
                <h2>Último cierre</h2>
                <Link href="/mobile/cierres">Ver historial →</Link>
              </div>
              {data.lastClose ? (
                <Link
                  className="m-list-link"
                  href={`/mobile/cierres/${data.lastClose.id}`}
                >
                  <span>{data.lastClose.date}</span>
                  <strong>
                    {money(
                      centsNumber(
                        moneyCents(data.lastClose.summary.total) -
                          moneyCents(data.lastClose.summary.tip),
                      ),
                      business,
                    )}
                  </strong>
                </Link>
              ) : (
                <p className="m-muted">Todavía no hay cierres guardados.</p>
              )}
            </section>
          </>
        )}
      </Status>
    </>
  );
}

function Pagination({ offset, pageSize, more, onChange }) {
  return (
    <div className="m-row m-pages">
      <button
        disabled={!offset}
        onClick={() => onChange(Math.max(0, offset - pageSize))}
      >
        Anterior
      </button>
      <span>Página {Math.floor(offset / pageSize) + 1}</span>
      <button disabled={!more} onClick={() => onChange(offset + pageSize)}>
        Siguiente
      </button>
    </div>
  );
}
function Inventory({ business }) {
  const [search, setSearch] = useState("");
  const [stock, setStock] = useState(
    () => new URLSearchParams(window.location.search).get("stock") || "all",
  );
  const [offset, setOffset] = useState(0);
  const [category, setCategory] = useState("");
  const categories = useRemote("categories", business.id);
  const request = useRemote("inventory", business.id, {
    search,
    stock,
    offset,
    category,
  });
  return (
    <>
      <p className="m-eyebrow">INVENTARIO</p>
      <h1>Existencias</h1>
      <form
        className="m-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(String(new FormData(event.currentTarget).get("search")));
          setOffset(0);
        }}
      >
        <label>
          Buscar producto
          <input
            type="search"
            name="search"
            placeholder="Nombre del producto"
          />
        </label>
        <button>Buscar</button>
      </form>
      <label>
        Estado
        <select
          value={stock}
          onChange={(event) => {
            setStock(event.target.value);
            setOffset(0);
          }}
        >
          <option value="all">Todos los productos</option>
          <option value="low">Stock bajo (0 a 2)</option>
          <option value="empty">Agotados</option>
        </select>
      </label>
      <Status request={categories}>
        {categories.data && (
          <label>
            Categoría
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">Todas las categorías</option>
              {categories.data.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </Status>
      <Status request={request}>
        {request.data && (
          <>
            <div className="m-list">
              {request.data.slice(0, 50).map((product) => (
                <Link
                  href={`/mobile/inventario/${product.id}`}
                  className="m-card m-list-link"
                  key={product.id}
                >
                  <div>
                    <h2>{product.name}</h2>
                    <small>{product.category || "Sin categoría"}</small>
                  </div>
                  <div className="m-stock">
                    <strong>{product.stock_quantity}</strong>
                    <span
                      className={
                        Number(product.stock_quantity) <= 2
                          ? "m-badge low"
                          : "m-badge"
                      }
                    >
                      {stockLabel(product.stock_quantity)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            {!request.data.length && (
              <p className="m-card">
                No hay productos que coincidan con estos filtros.
              </p>
            )}
            <Pagination
              offset={offset}
              pageSize={50}
              more={request.data.length > 50}
              onChange={setOffset}
            />
          </>
        )}
      </Status>
    </>
  );
}

function Product({ business, id }) {
  const request = useRemote("product", business.id, { id });
  const [kind, setKind] = useState("add"),
    [quantity, setQuantity] = useState(""),
    [reason, setReason] = useState("Compra/reposición"),
    [pin, setPin] = useState("");
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  const attempted = useRef(null),
    submitting = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (submitting.current || !request.data) return;
    setError("");
    setSuccess("");
    let delta;
    try {
      delta = moneyCents(quantity);
      if (delta <= 0n) throw new Error("La cantidad debe ser positiva.");
      if (kind === "remove") delta = -delta;
    } catch (error) {
      setError(error.message);
      return;
    }
    const next = moneyCents(request.data.stock) + delta;
    if (next < 0n) {
      setError("El retiro supera las existencias.");
      return;
    }
    if (
      !attempted.current &&
      !window.confirm(
        `${request.data.name}: ${request.data.stock} → ${centsNumber(next)} unidades. Motivo: ${reason}. ¿Confirmar ajuste?`,
      )
    )
      return;
    submitting.current = true;
    setBusy(true);
    try {
      const deviceId = getDeviceId();
      const verified = await mobileApi("pin_verify", business.id, {
        pin,
        deviceId,
      });
      setPin("");
      if (!verified.ok) throw new Error(verified.error);
      attempted.current ||= {
        id,
        delta: centsNumber(delta),
        reason,
        expectedStock: request.data.stock,
        idempotencyKey: crypto.randomUUID(),
        deviceId,
      };
      await mobileApi("adjust", business.id, {
        ...attempted.current,
        token: verified.token,
      });
      attempted.current = null;
      setQuantity("");
      setSuccess("Ajuste guardado. El movimiento quedó registrado.");
      request.reload();
    } catch (error) {
      setError(
        error.message +
          (attempted.current
            ? " Si no recibiste confirmación, reintenta con el mismo ajuste; no se duplicará."
            : ""),
      );
      if (error.message.includes("stock cambió")) {
        attempted.current = null;
        request.reload();
      }
    } finally {
      submitting.current = false;
      setBusy(false);
      setPin("");
    }
  }
  return (
    <>
      <Link href="/mobile/inventario">← Inventario</Link>
      <Status request={request}>
        {request.data && (
          <>
            <h1>{request.data.name}</h1>
            <div className="m-card m-highlight">
              <span>{stockLabel(request.data.stock)}</span>
              <strong className="m-large">{request.data.stock}</strong>
              <span>unidades disponibles</span>
            </div>
            <form className="m-card" onSubmit={submit}>
              <h2>Ajustar existencias</h2>
              <fieldset disabled={busy || Boolean(attempted.current)}>
                <legend>Movimiento</legend>
                <label>
                  Tipo
                  <select
                    value={kind}
                    onChange={(event) => {
                      setKind(event.target.value);
                      setReason(
                        event.target.value === "add"
                          ? "Compra/reposición"
                          : "Merma",
                      );
                    }}
                  >
                    <option value="add">Agregar unidades</option>
                    <option value="remove">Retirar unidades</option>
                  </select>
                </label>
                <label>
                  Cantidad
                  <input
                    inputMode="decimal"
                    value={quantity}
                    onChange={(event) =>
                      setQuantity(event.target.value.replace(",", "."))
                    }
                    pattern="[0-9]+([.][0-9]{1,2})?"
                    required
                  />
                </label>
                <label>
                  Motivo
                  <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    list="stock-reasons"
                    minLength={3}
                    maxLength={240}
                    required
                  />
                </label>
                <datalist id="stock-reasons">
                  <option>Compra/reposición</option>
                  <option>Merma</option>
                  <option>Pérdida</option>
                  <option>Corrección</option>
                </datalist>
              </fieldset>
              <label>
                PIN administrativo
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  pattern="[0-9]{6,12}"
                  minLength={6}
                  maxLength={12}
                  required
                  disabled={busy}
                />
              </label>
              <p className="m-muted">
                El servidor comprobará tu PIN y las existencias antes de
                guardar.
              </p>
              <button className="m-primary" disabled={busy}>
                {busy
                  ? "Guardando…"
                  : attempted.current
                    ? "Reintentar el mismo ajuste"
                    : "Confirmar ajuste"}
              </button>
              <Link href="/mobile/ajustes">Configurar o recuperar PIN</Link>
              {error && <p role="alert">{error}</p>}
              {success && <p role="status">{success}</p>}
            </form>
            <section className="m-card">
              <h2>Últimos movimientos</h2>
              {request.data.movements.length ? (
                request.data.movements.map((movement) => (
                  <article className="m-movement" key={movement.id}>
                    <div className="m-row">
                      <strong>
                        {Number(movement.delta) > 0 ? "+" : ""}
                        {movement.delta}
                      </strong>
                      <span>Saldo: {movement.stock_nuevo}</span>
                    </div>
                    <p>{movement.motivo}</p>
                    <small>
                      {dateTime(movement.created_at, business)} · Usuario{" "}
                      {movement.actor_user_id || "Sistema"}
                    </small>
                  </article>
                ))
              ) : (
                <p>
                  No hay movimientos registrados desde la habilitación del
                  historial.
                </p>
              )}
            </section>
          </>
        )}
      </Status>
    </>
  );
}

function Closes({ business, id }) {
  const [offset, setOffset] = useState(0);
  const request = useRemote(
    id ? "close" : "closes",
    business.id,
    id ? { id } : { offset },
  );
  let breakdown = [],
    summary = null,
    issue = "";
  if (id && request.data) {
    try {
      summary = summarizePayments(request.data.data.payments || []);
      breakdown = summarizeBreakdown(request.data.data.payments || []);
    } catch (error) {
      issue = error.message;
    }
  }
  return (
    <>
      <Link href="/mobile/">← Inicio</Link>
      <h1>{id ? `Cierre ${request.data?.date || ""}` : "Cierres de caja"}</h1>
      <Status request={request}>
        {request.data &&
          (id ? (
            <>
              <div className="m-card">
                <h2>Resumen guardado</h2>
                <strong className="m-large">
                  {money(
                    centsNumber(
                      moneyCents(request.data.data.summary.total) -
                        moneyCents(request.data.data.summary.tip),
                    ),
                    business,
                  )}
                </strong>
                <p>Ventas sin propina</p>
                <p>
                  Propinas: {money(request.data.data.summary.tip, business)}
                </p>
                <p>{request.data.data.summary.tickets} tickets</p>
              </div>
              {issue ? (
                <p role="alert" className="m-notice">
                  No es posible conciliar este desglose: {issue}
                </p>
              ) : (
                <section className="m-card">
                  <h2>Medios de pago</h2>
                  {breakdown.map((entry) => (
                    <div className="m-movement" key={entry.method}>
                      <div className="m-row">
                        <strong>{entry.method}</strong>
                        <strong>{money(entry.sales, business)}</strong>
                      </div>
                      <small>
                        Propinas: {money(entry.tip, business)} · Total:{" "}
                        {money(entry.total, business)}
                      </small>
                    </div>
                  ))}
                  {summary &&
                    (moneyCents(summary.total) !==
                      moneyCents(request.data.data.summary.total) ||
                      JSON.stringify(
                        breakdown.map((b) => [b.method, b.total]).sort(),
                      ) !==
                        JSON.stringify(
                          (request.data.data.breakdown || [])
                            .map((b) => [b.method, b.total])
                            .sort(),
                        )) && (
                      <p className="m-notice">
                        El desglose se recalculó desde los pagos guardados con
                        la regla actual. El cierre histórico no se ha
                        modificado.
                      </p>
                    )}
                </section>
              )}
              <Link href="/mobile/cierres">Ver todos los cierres</Link>
            </>
          ) : (
            <>
              <div className="m-list">
                {request.data.slice(0, 30).map((close) => (
                  <Link
                    className="m-card m-list-link"
                    key={close.id}
                    href={`/mobile/cierres/${close.id}`}
                  >
                    <span>
                      {close.date_iso}
                      <small>{close.summary.tickets} tickets</small>
                    </span>
                    <strong>
                      {money(
                        centsNumber(
                          moneyCents(close.summary.total) -
                            moneyCents(close.summary.tip),
                        ),
                        business,
                      )}
                    </strong>
                  </Link>
                ))}
              </div>
              {!request.data.length && (
                <p className="m-card">Todavía no hay cierres guardados.</p>
              )}
              <Pagination
                offset={offset}
                pageSize={30}
                more={request.data.length > 30}
                onChange={setOffset}
              />
            </>
          ))}
      </Status>
    </>
  );
}

function CloseNotificationSummary({ details, business }) {
  if (!details?.payments?.length) return null;
  let summary, breakdown;
  try {
    summary = summarizePayments(details.payments);
    breakdown = summarizeBreakdown(details.payments);
  } catch { return <span>Consulta el detalle para revisar el resumen.</span>; }
  return <span className="m-close-notification"><strong>Ventas: {money(summary.sales,business)}</strong><span>{breakdown.map(entry=>`${entry.method}: ${money(entry.sales,business)}`).join(" · ")}</span><span>Propinas: {money(summary.tip,business)}</span></span>;
}

function Notifications({ business }) {
  const [offset, setOffset] = useState(0),
    [error, setError] = useState("");
  const request = useRemote("notifications", business.id, { offset });
  async function open(notification) {
    try {
      await mobileApi("mark_read", business.id, { id: notification.id });
      if (
        /^\/mobile\/(inventario|cierres)\/[0-9a-f-]+$/.test(notification.href)
      )
        navigate(notification.href);
      else request.reload();
    } catch (error) {
      setError(error.message);
    }
  }
  return (
    <>
      <p className="m-eyebrow">NOTIFICACIONES</p>
      <h1>Lo que debes saber</h1>
      {error && <p role="alert">{error}</p>}
      <Status request={request}>
        {request.data && (
          <>
            <div className="m-list">
              {request.data.slice(0, 50).map((notification) => (
                <button
                  className={`m-card m-alert ${notification.read_at ? "" : "unread"}`}
                  key={notification.id}
                  onClick={() => open(notification)}
                >
                  <span className="m-row">
                    <strong>{notification.title}</strong>
                    {!notification.read_at && (
                      <span className="m-badge">Nueva</span>
                    )}
                  </span>
                  <p>{notification.body}</p>
                  {notification.kind === "close" && <CloseNotificationSummary details={notification.details} business={business} />}
                  <small>{dateTime(notification.created_at, business)}</small>
                </button>
              ))}
            </div>
            {!request.data.length && (
              <p className="m-card">
                No tienes notificaciones. Las nuevas alertas de stock y cierres
                aparecerán aquí.
              </p>
            )}
            <Pagination
              offset={offset}
              pageSize={50}
              more={request.data.length > 50}
              onChange={setOffset}
            />
          </>
        )}
      </Status>
    </>
  );
}

function Settings({ business, installEvent, onInstalled, onSignOut }) {
  const request = useRemote("settings", business.id);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(action) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
      request.reload();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function savePin(event) {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    if (values.get("pin") !== values.get("confirm")) {
      setMessage("Los PIN no coinciden.");
      return;
    }
    await run(async () => {
      try {
        await configurePin(
          business.id,
          String(values.get("password")),
          String(values.get("pin")),
        );
        setMessage(
          "PIN configurado. Las autorizaciones anteriores quedaron revocadas.",
        );
      } finally {
        form.reset();
      }
    });
  }
  return (
    <>
      <p className="m-eyebrow">AJUSTES</p>
      <h1>Tu Klooyd</h1>
      <section className="m-card">
        <h2>Instalar en el teléfono</h2>
        {installEvent ? (
          <button
            onClick={() =>
              run(async () => {
                await installEvent.prompt();
                await installEvent.userChoice;
                onInstalled();
              })
            }
          >
            Instalar Klooyd
          </button>
        ) : (
          <p>
            En iPhone: abre Klooyd en Safari, pulsa Compartir y «Agregar a
            pantalla de inicio». En Android: abre el menú del navegador y
            selecciona «Instalar aplicación» o «Agregar a pantalla de inicio».
          </p>
        )}
      </section>
      <Status request={request}>
        {request.data && (
          <>
            <section className="m-card">
              <h2>Notificaciones</h2>
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await enablePush(business.id);
                    setMessage(
                      "Dispositivo registrado para recibir notificaciones.",
                    );
                  })
                }
              >
                Activar en este dispositivo
              </button>
              {Object.entries({
                stock_enabled: "Alertas de stock bajo",
                close_enabled: "Cierres de caja",
                show_details: "Mostrar detalles en pantalla bloqueada",
              }).map(([key, label]) => (
                <label className="m-check" key={key}>
                  <input
                    type="checkbox"
                    checked={request.data.preferences[key]}
                    disabled={busy}
                    onChange={(event) =>
                      run(() =>
                        mobileApi("preferences", business.id, {
                          ...request.data.preferences,
                          [key]: event.target.checked,
                        }),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
              <h3>Dispositivos de este negocio</h3>
              {request.data.devices.length ? (
                request.data.devices.map((device) => (
                  <div className="m-row m-movement" key={device.id}>
                    <span>{device.label}</span>
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          mobileApi("unsubscribe", business.id, {
                            id: device.id,
                          }),
                        )
                      }
                    >
                      Revocar
                    </button>
                  </div>
                ))
              ) : (
                <p>No hay dispositivos registrados.</p>
              )}
            </section>
          </>
        )}
      </Status>
      <form className="m-card" onSubmit={savePin}>
        <h2>Configurar, cambiar o recuperar PIN</h2>
        <p>
          El PIN es personal y se usa para cambios sensibles. Vuelve a verificar
          tu contraseña para establecerlo.
        </p>
        <label>
          Contraseña actual
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
          />
        </label>
        <label>
          Nuevo PIN (6–12 dígitos)
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6,12}"
            minLength={6}
            maxLength={12}
            autoComplete="off"
            required
            disabled={busy}
          />
        </label>
        <label>
          Repite el PIN
          <input
            name="confirm"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6,12}"
            minLength={6}
            maxLength={12}
            autoComplete="off"
            required
            disabled={busy}
          />
        </label>
        <button className="m-primary" disabled={busy}>
          Guardar PIN
        </button>
      </form>
      {message && (
        <p className="m-notice" role="status">
          {message}
        </p>
      )}
      <button onClick={onSignOut}>Cerrar sesión</button>
    </>
  );
}

function OwnerWorkspace({ session, installEvent, onInstalled }) {
  const context = useRemote("context");
  const [selected, setSelected] = useState(
    () => new URLSearchParams(window.location.search).get("business") || "",
  );
  const [path, setPath] = useState(window.location.pathname),
    [error, setError] = useState("");
  useEffect(() => {
    const listener = () => setPath(window.location.pathname);
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  const reloadContext = context.reload;
  useEffect(() => {
    const refresh = () => reloadContext(true);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [reloadContext]);
  const business =
    context.data?.businesses.find((item) => item.id === selected) ||
    context.data?.businesses[0];
  async function signOut() {
    setError("");
    try {
      await mobileApi("logout_device", null, { deviceId: getDeviceId() });
    } catch {
      /* Auth sign-out still takes priority. */
    }
    try {
      const registration =
        await navigator.serviceWorker?.getRegistration("/mobile/");
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
    } catch {
      /* Auth sign-out still takes priority. */
    }
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) setError("No se pudo cerrar la sesión. Reintenta.");
  }
  if (context.loading || context.error)
    return (
      <main className="m-login">
        <img className="m-logo" src="/logoklooyd.png" alt="Klooyd" />
        <Status request={context} />
        <button onClick={signOut}>Cerrar sesión</button>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  if (!business)
    return (
      <main className="m-login">
        <h1>Acceso para propietarios</h1>
        <p>
          Tu cuenta no tiene un negocio activo disponible con rol de
          propietario.
        </p>
        <button onClick={signOut}>Cerrar sesión</button>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  const section = path.replace(/^\/mobile\/?/, "").replace(/\/$/, "");
  const [page, id] = section.split("/");
  let content;
  if (!page || page === "index.html" || page === "login")
    content = <Dashboard business={business} />;
  else if (page === "estadisticas")
    content = <Dashboard business={business} statistics />;
  else if (page === "inventario")
    content = id ? (
      <Product key={id} business={business} id={id} />
    ) : (
      <Inventory business={business} />
    );
  else if (page === "cierres")
    content = <Closes key={id || "list"} business={business} id={id} />;
  else if (page === "notificaciones")
    content = <Notifications business={business} />;
  else if (page === "ajustes" || page === "pin")
    content = (
      <Settings
        business={business}
        installEvent={installEvent}
        onInstalled={onInstalled}
        onSignOut={signOut}
      />
    );
  else
    content = (
      <div className="m-card">
        <h1>Página no disponible</h1>
        <Link href="/mobile/">Volver al inicio</Link>
      </div>
    );
  return (
    <div className="m-app">
      <a className="m-skip" href="#mobile-content">
        Saltar al contenido
      </a>
      <header className="m-header">
        <Link href="/mobile/" aria-label="Klooyd, inicio">
          <img src="/logoklooyd.png" alt="Klooyd" />
        </Link>
        <Link href="/mobile/ajustes" className="m-settings">
          Ajustes
        </Link>
      </header>
      <div className="m-business">
        <p>Hola, {session.user.email?.split("@")[0] || "propietario"}</p>
        <label className="m-business-select">
          Negocio
          <select
            value={business.id}
            onChange={(event) => {
              setSelected(event.target.value);
              navigate("/mobile/");
            }}
          >
            {context.data.businesses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <main id="mobile-content" key={business.id} className="m-content">
        {content}
      </main>
      <nav className="m-nav" aria-label="Navegación principal">
        {[
          ["", "Inicio", "⌂"],
          ["estadisticas", "Ventas", "▥"],
          ["inventario", "Inventario", "▦"],
          ["notificaciones", "Alertas", "○"],
        ].map(([route, label, icon]) => (
          <Link
            key={route}
            href={`/mobile/${route}`}
            aria-current={(page || "") === route ? "page" : undefined}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export default function MobileApp() {
  const [session, setSession] = useState(undefined),
    [authError, setAuthError] = useState(""),
    [installEvent, setInstallEvent] = useState(null);
  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active) {
          setSession(data.session);
          if (error) setAuthError("No se pudo recuperar la sesión.");
        }
      })
      .catch(() => {
        if (active) {
          setSession(null);
          setAuthError("No se pudo recuperar la sesión.");
        }
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      queueMicrotask(() => {
        if (active) setSession(next);
      });
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    const listener = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    window.addEventListener("beforeinstallprompt", listener);
    return () => window.removeEventListener("beforeinstallprompt", listener);
  }, []);
  if (session === undefined)
    return (
      <main className="m-login" role="status">
        Comprobando tu sesión…
      </main>
    );
  if (!session)
    return (
      <>
        {authError && <p role="alert">{authError}</p>}
        <Login />
      </>
    );
  return (
    <OwnerWorkspace
      key={session.user.id}
      session={session}
      installEvent={installEvent}
      onInstalled={() => setInstallEvent(null)}
    />
  );
}

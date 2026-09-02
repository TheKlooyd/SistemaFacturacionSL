import { useEffect, useState } from "react";
import { newSecret, qrOrder } from "./qrOrderApi";

const storageKey = (qrToken) => `sabor-latino-qr-session:${qrToken}`;

function money(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function loadSessionToken(qrToken) {
  try {
    return localStorage.getItem(storageKey(qrToken)) || newSecret();
  } catch {
    return newSecret();
  }
}

function saveSessionToken(qrToken, sessionToken) {
  try {
    localStorage.setItem(storageKey(qrToken), sessionToken);
  } catch {
    // La sesión todavía funciona durante esta pestaña aunque localStorage esté bloqueado.
  }
}

function removeSessionToken(qrToken) {
  try {
    localStorage.removeItem(storageKey(qrToken));
  } catch {
    // No hay nada adicional que limpiar si el navegador bloquea localStorage.
  }
}

const TERMINAL_MESSAGES = {
  invalid: "Este código no está disponible.",
  inactive: "Esta mesa no está disponible en este momento.",
  occupied: "Esta mesa ya tiene un pedido en curso. Para agregar o modificar productos, llama a un mesero.",
  draft_elsewhere: "Ya existe una sesión activa para esta mesa desde otro dispositivo.",
  expired: "Tu borrador venció. Escanea nuevamente el código QR para empezar un pedido.",
  preview_limit: "Se alcanzó el límite de revisiones para esta sesión. Llama a un mesero para continuar.",
  submitted: "Tu pedido fue enviado correctamente. Para agregar o modificar productos, llama a un mesero.",
};

export default function CustomerQrOrderView({ qrToken }) {
  const [sessionToken] = useState(() => loadSessionToken(qrToken));
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, setState] = useState({ phase: "ready" });
  const [started, setStarted] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!started) return undefined;

    let cancelled = false;

    void qrOrder("start", { qrToken, sessionToken })
      .then((result) => {
        if (cancelled) return;

        if (result?.state !== "ok") {
          setState({ phase: result?.state || "invalid" });
          return;
        }

        saveSessionToken(qrToken, sessionToken);
        setText(typeof result.draft_text === "string" ? result.draft_text : "");

        const restoredItems = Array.isArray(result.draft_items) ? result.draft_items : [];
        const restoredUnmatched = Array.isArray(result.draft_unmatched)
          ? result.draft_unmatched
          : [];
        if (result.draft_text || restoredItems.length > 0 || restoredUnmatched.length > 0) {
          setPreview({
            items: restoredItems,
            unmatched: restoredUnmatched,
            total: Number(result.draft_total) || 0,
          });
        }

        setState({ phase: "draft", ...result });
      })
      .catch((error) => {
        if (!cancelled) setState({ phase: "error", message: error.message });
      });

    return () => {
      cancelled = true;
    };
  }, [qrToken, sessionToken, started]);

  async function review() {
    if (!text.trim() || state.phase !== "draft") return;

    setFeedback("");
    setState((current) => ({ ...current, phase: "reviewing" }));

    try {
      const result = await qrOrder("preview", { sessionToken, text });

      if (result?.state === "rate_limited") {
        setFeedback("Espera dos segundos antes de volver a interpretar el pedido.");
        setState((current) => ({ ...current, phase: "draft" }));
        return;
      }
      if (result?.state !== "ok") {
        setState((current) => ({ ...current, phase: result?.state || "error" }));
        return;
      }

      setPreview(result);
      setState((current) => ({ ...current, phase: "draft" }));
    } catch (error) {
      setFeedback(error.message);
      setState((current) => ({ ...current, phase: "draft" }));
    }
  }

  async function submit() {
    if (!preview?.items?.length || state.phase !== "draft") return;

    setFeedback("");
    setState((current) => ({ ...current, phase: "submitting" }));

    try {
      const result = await qrOrder("submit", {
        sessionToken,
        idempotencyKey,
      });

      if (result?.state === "submitted") {
        setState({ phase: "submitted", mesa_number: state.mesa_number });
        removeSessionToken(qrToken);
        return;
      }
      if (result?.state === "no_preview") {
        setFeedback("Vuelve a interpretar el pedido antes de enviarlo.");
        setPreview(null);
        setState((current) => ({ ...current, phase: "draft" }));
        return;
      }

      setState((current) => ({ ...current, phase: result?.state || "error" }));
    } catch (error) {
      setFeedback(error.message);
      setState((current) => ({ ...current, phase: "draft" }));
    }
  }

  const terminalMessage = TERMINAL_MESSAGES[state.phase];

  return (
    <main className="qrCustomerPage">
      <section className="qrCustomerPanel">
        <img
          src={`${import.meta.env.BASE_URL}saborlatinologo.png`}
          alt="Sabor Latino"
          className="qrLogo"
        />

        {state.phase === "ready" ? (
          <>
            <h1>Pedido por QR</h1>
            <p>Pulsa el botón para comenzar tu pedido.</p>
            <button
              type="button"
              className="btnPrimary qrAction"
              onClick={() => {
                saveSessionToken(qrToken, sessionToken);
                setStarted(true);
              }}
            >
              Comenzar pedido
            </button>
          </>
        ) : state.phase === "loading" ? (
          <p>Cargando mesa...</p>
        ) : terminalMessage ? (
          <>
            <h1>{state.phase === "submitted" ? "Pedido enviado" : "Pedido no disponible"}</h1>
            <p>{terminalMessage}</p>
          </>
        ) : state.phase === "error" ? (
          <>
            <h1>No fue posible continuar</h1>
            <p>{state.message || "Intenta escanear nuevamente el código QR."}</p>
          </>
        ) : (
          <>
            <p className="qrTable">Mesa {state.mesa_number}</p>
            <h1>Haz tu pedido</h1>

            <textarea
              className="input qrTextarea"
              value={text}
              maxLength={1500}
              onChange={(event) => {
                setText(event.target.value);
                setPreview(null);
                setFeedback("");
              }}
              placeholder="Ej: una pizza grande hawaiana y una gaseosa familiar de manzana"
              disabled={state.phase !== "draft"}
            />

            {feedback && <p className="qrFeedback">{feedback}</p>}

            {preview && (
              <div className="qrPreview">
                <h2>Revisa tu pedido</h2>
                {preview.items.map((item, index) => (
                  <div className="qrLine" key={`${item.product_id}-${item.note}-${index}`}>
                    <span>
                      {item.qty} x {item.name}{item.note ? ` (${item.note})` : ""}
                    </span>
                    <strong>{money(item.unit_price * item.qty)}</strong>
                  </div>
                ))}

                {preview.unmatched?.length > 0 && (
                  <p className="qrWarning">
                    No se incluirán hasta que corrijas el texto: {preview.unmatched.join(", ")}.
                  </p>
                )}

                <div className="qrTotal">
                  <span>Total</span>
                  <strong>{money(preview.total)}</strong>
                </div>
              </div>
            )}

            <button
              className="btnPrimary qrAction"
              onClick={review}
              disabled={state.phase !== "draft" || !text.trim()}
            >
              {state.phase === "reviewing" ? "Interpretando..." : "Interpretar pedido"}
            </button>

            {preview && (
              <button
                className="btn qrAction"
                onClick={submit}
                disabled={state.phase !== "draft" || preview.items.length === 0}
              >
                {state.phase === "submitting" ? "Enviando..." : "Confirmar y enviar"}
              </button>
            )}
          </>
        )}
      </section>
    </main>
  );
}


import { supabase } from "../supabaseClient.js";

export async function mobileApi(action, businessId = null, payload = {}) {
  const rpc = ["daily", "create_catalog_item"].includes(action)
    ? "klooyd_mobile_workspace"
    : "klooyd_mobile";
  const { data, error } = await supabase.rpc(rpc, {
    p_action: action,
    p_negocio: businessId,
    p_payload: payload,
  });
  if (error) {
    if (["PGRST202", "42883"].includes(error.code))
      throw new Error(
        "Klooyd Mobile aún no está habilitado en este entorno. La configuración del servidor está pendiente.",
      );
    throw new Error(
      error.code === "42501"
        ? "Acceso no autorizado o PIN vencido. Comprueba tu sesión y vuelve a verificar el PIN."
        : error.code === "P0001"
          ? error.message
          : "No pudimos completar la solicitud. Comprueba tu conexión y reintenta.",
    );
  }
  return data;
}

export function getDeviceId() {
  const key = "klooyd-mobile-device";
  let id = window.localStorage.getItem(key);
  if (!/^[0-9a-f-]{36}$/i.test(id || "")) {
    id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
  }
  return id;
}

export async function configurePin(businessId, password, pin) {
  const { data, error } = await supabase.functions.invoke("mobile-pin", {
    body: { businessId, password, pin },
  });
  if (error || !data?.ok)
    throw new Error(
      "No se pudo configurar el PIN. Verifica tu contraseña y reintenta más tarde.",
    );
  return data;
}

export async function enablePush(businessId) {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    throw new Error(
      "Este navegador no admite notificaciones push. Puedes consultar la bandeja de alertas.",
    );
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (
    ios &&
    !window.matchMedia("(display-mode: standalone)").matches &&
    !navigator.standalone
  )
    throw new Error(
      "En iPhone, agrega Klooyd a la pantalla de inicio y ábrelo desde su icono antes de activar las notificaciones.",
    );
  const publicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY;
  if (!publicKey)
    throw new Error(
      "Las notificaciones push todavía no están configuradas en este entorno.",
    );
  // Called only by the explicit button press, never during page load.
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      permission === "denied"
        ? "Permiso denegado. Puedes cambiarlo en los ajustes del navegador; la bandeja sigue disponible."
        : "No se activaron las notificaciones.",
    );
  const registration =
    await navigator.serviceWorker.getRegistration("/mobile/");
  if (!registration?.active)
    throw new Error(
      "La instalación no está lista. Vuelve a abrir Klooyd y reintenta.",
    );
  const normalized = publicKey.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(
    atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
    (c) => c.charCodeAt(0),
  );
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    }));
  await mobileApi("subscribe", businessId, {
    subscription: subscription.toJSON(),
    deviceId: getDeviceId(),
    label: ios ? "iPhone / iPad" : "Navegador móvil",
  });
}

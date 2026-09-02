import { supabase } from "./supabaseClient";

export async function qrOrder(action, body) {
  const { data, error } = await supabase.functions.invoke("qr-order", { body: { action, ...body } });
  if (error) {
    let message = "No fue posible comunicarse con el servicio de pedidos.";
    try {
      const payload = await error.context?.clone?.().json();
      if (payload?.error) message = payload.error;
    } catch {
      // La respuesta no siempre incluye un cuerpo JSON.
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function newSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

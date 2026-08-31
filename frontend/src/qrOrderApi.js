import { supabase } from "./supabaseClient";

export async function qrOrder(action, body) {
  const { data, error } = await supabase.functions.invoke("qr-order", { body: { action, ...body } });
  if (error) throw new Error("No fue posible comunicarse con el servicio de pedidos.");
  if (data?.error) throw new Error(data.error);
  return data;
}

export function newSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
import { supabase } from "./supabaseClient";

/**
 * Sends free-text order description + product catalog to the `parse-order`
 * Supabase Edge Function, which uses an AI model to turn it into structured
 * order lines: [{ product_id, qty, note, unmatched_name }]
 */
export async function parseOrderWithAI(text, products) {
  const catalog = (products || []).map((p) => ({
    id: p.id,
    name: p.name,
    size: p.size ?? null,
  }));

  const { data, error } = await supabase.functions.invoke("parse-order", {
    body: { text, products: catalog },
  });

  if (error) {
    console.error("parseOrderWithAI error:", error);
    throw new Error("No se pudo interpretar el pedido con IA. Intenta de nuevo.");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  if (!data || !Array.isArray(data.lines)) {
    throw new Error("Respuesta de IA inválida.");
  }

  return data.lines;
}

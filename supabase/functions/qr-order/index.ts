import { createClient } from "npm:@supabase/supabase-js@2";
import { MAX_ORDER_TEXT_LENGTH, parseOrderWithGroq } from "../_shared/groqOrder.ts";
import { buildSystemPrompt } from "../parse-order/index.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return reply({ error: "Método no permitido." }, 405);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply({ error: "Solicitud inválida." }, 400); }
  const action = body.action;
  const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken : "";
  if (typeof action !== "string" || (action !== "start" && !sessionToken)) return reply({ error: "Solicitud inválida." }, 400);
  const admin = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", { auth: { persistSession: false } });
  const sessionHash = sessionToken ? await hash(sessionToken) : "";
  try {
    if (action === "start") {
      const qrToken = typeof body.qrToken === "string" ? body.qrToken : "";
      if (qrToken.length < 32 || sessionToken.length < 32) return reply({ error: "Código no válido." }, 400);
      const { data, error } = await admin.rpc("qr_start_session", { p_qr_hash: await hash(qrToken), p_session_hash: sessionHash });
      if (error) throw error;
      return reply(data);
    }
    if (action === "status") {
      const { data, error } = await admin.rpc("qr_session_status", { p_session_hash: sessionHash });
      if (error) throw error;
      return reply(data);
    }
    if (action === "preview") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text || text.length > MAX_ORDER_TEXT_LENGTH) return reply({ error: "El pedido debe tener entre 1 y 1500 caracteres." }, 400);
      const { data: session, error: statusError } = await admin.rpc("qr_session_status", { p_session_hash: sessionHash });
      if (statusError || session?.status !== "draft") return reply({ state: session?.status || "invalid" }, 409);
      const { data: products, error: productsError } = await admin.from("productos").select("id,name,price");
      if (productsError) throw productsError;
      const aiLines = await parseOrderWithGroq(text, products || [], buildSystemPrompt());
      const productById = new Map((products || []).map((product) => [String(product.id), product]));
      const items = aiLines.flatMap((line) => {
        const product = line.product_id ? productById.get(String(line.product_id)) : null;
        return product ? [{ product_id: product.id, name: product.name, unit_price: Number(product.price), qty: line.qty, note: line.note }] : [];
      });
      const unmatched = aiLines.filter((line) => !line.product_id).map((line) => line.unmatched_name);
      const total = items.reduce((sum, item) => sum + item.unit_price * item.qty, 0);
      const { error: previewError } = await admin.rpc("qr_save_preview", { p_session_hash: sessionHash, p_text: text, p_items: items, p_total: total });
      if (previewError) throw previewError;
      return reply({ state: "ok", items, total, unmatched, expires_at: session.expires_at });
    }
    if (action === "submit") {
      const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idempotencyKey)) return reply({ error: "Solicitud inválida." }, 400);
      const { data, error } = await admin.rpc("qr_submit_order", { p_session_hash: sessionHash, p_idempotency_key: idempotencyKey });
      if (error) throw error;
      return reply(data);
    }
    return reply({ error: "Solicitud inválida." }, 400);
  } catch (error) {
    console.error("qr-order failed", action, error instanceof Error ? error.message : "unknown");
    return reply({ error: "No fue posible procesar la solicitud. Intenta nuevamente." }, 502);
  }
});
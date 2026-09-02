import { createClient } from "npm:@supabase/supabase-js@2";
import {
  MAX_ORDER_TEXT_LENGTH,
  parseOrderWithGroq,
} from "../_shared/groqOrder.ts";
import { buildSystemPrompt } from "../parse-order/index.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ALLOWED_ACTIONS = new Set(["start", "status", "preview", "submit"]);

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

async function hash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function validSecret(value: string) {
  return value.length >= 32 && value.length <= 256;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (request.method !== "POST") return reply({ error: "Método no permitido." }, 405);

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 20_000) return reply({ error: "La solicitud es demasiado grande." }, 413);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "Solicitud inválida." }, 400);
  }

  const action = typeof body.action === "string" ? body.action : "";
  const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken : "";

  if (!ALLOWED_ACTIONS.has(action)) return reply({ error: "Solicitud inválida." }, 400);
  if (!validSecret(sessionToken)) return reply({ error: "Sesión inválida." }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("qr-order missing Supabase server configuration");
    return reply({ error: "El servicio no está configurado." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sessionHash = await hash(sessionToken);

  try {
    if (action === "start") {
      const qrToken = typeof body.qrToken === "string" ? body.qrToken : "";
      if (!validSecret(qrToken)) return reply({ error: "Código no válido." }, 400);

      const { data, error } = await admin.rpc("qr_start_session", {
        p_qr_hash: await hash(qrToken),
        p_session_hash: sessionHash,
      });
      if (error) throw error;
      return reply(data);
    }

    if (action === "status") {
      const { data, error } = await admin.rpc("qr_session_status", {
        p_session_hash: sessionHash,
      });
      if (error) throw error;
      return reply(data);
    }

    if (action === "preview") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text || text.length > MAX_ORDER_TEXT_LENGTH) {
        return reply({ error: "El pedido debe tener entre 1 y 1500 caracteres." }, 400);
      }

      const { data: claim, error: claimError } = await admin.rpc("qr_claim_preview", {
        p_session_hash: sessionHash,
      });
      if (claimError) throw claimError;
      if (claim?.state !== "ok") return reply(claim || { state: "invalid" });

      const { data: products, error: productsError } = await admin
        .from("productos")
        .select("id,name,price");
      if (productsError) throw productsError;

      const availableProducts = products || [];
      const aiLines = await parseOrderWithGroq(text, availableProducts, buildSystemPrompt());
      const productById = new Map(
        availableProducts.map((product) => [String(product.id), product])
      );

      const items = aiLines.flatMap((line) => {
        const product = line.product_id
          ? productById.get(String(line.product_id))
          : undefined;
        const unitPrice = Number(product?.price);

        if (!product || !Number.isFinite(unitPrice) || unitPrice < 0) return [];

        return [{
          line_id: crypto.randomUUID(),
          product_id: product.id,
          name: product.name,
          unit_price: unitPrice,
          qty: line.qty,
          note: line.note,
        }];
      });
      const unmatched = aiLines
        .filter((line) => !line.product_id)
        .map((line) => line.unmatched_name)
        .filter((name): name is string => Boolean(name));
      const total = items.reduce(
        (sum, item) => sum + item.unit_price * item.qty,
        0
      );

      const { data: saved, error: previewError } = await admin.rpc("qr_save_preview", {
        p_session_hash: sessionHash,
        p_text: text,
        p_items: items,
        p_unmatched: unmatched,
        p_total: total,
      });
      if (previewError) throw previewError;
      if (saved?.state !== "ok") return reply(saved || { state: "expired" });

      return reply({
        state: "ok",
        items,
        total,
        unmatched,
        expires_at: saved.expires_at,
      });
    }

    if (action === "submit") {
      const idempotencyKey = typeof body.idempotencyKey === "string"
        ? body.idempotencyKey
        : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
        return reply({ error: "Solicitud inválida." }, 400);
      }

      const { data, error } = await admin.rpc("qr_submit_order", {
        p_session_hash: sessionHash,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      return reply(data);
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    console.error("qr-order failed", action, code);

    if (code === "GROQ_RATE_LIMIT") {
      return reply({ error: "La IA está ocupada. Intenta nuevamente en unos segundos." }, 429);
    }
    if (code === "GROQ_NETWORK_ERROR") {
      return reply({ error: "No fue posible contactar el servicio de IA." }, 502);
    }

    return reply({ error: "No fue posible procesar la solicitud. Intenta nuevamente." }, 502);
  }

  return reply({ error: "Solicitud inválida." }, 400);
});

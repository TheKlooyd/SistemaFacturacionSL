import { createClient } from "npm:@supabase/supabase-js@2";
import { MAX_ORDER_TEXT_LENGTH, parseOrderWithGroq } from "../_shared/groqOrder.ts";
import { buildBusinessPrompt } from "../_shared/businessPrompt.ts";
import { resolveAiTenant } from "../_shared/tenantAi.ts";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

if (import.meta.main) Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return reply({ error: "Método no permitido." }, 405);
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer /, "");
  if (!token) return reply({ error: "Debes iniciar sesión." }, 401);
  if (Number(request.headers.get("content-length") || 0) > 500000) return reply({ error: "Solicitud demasiado grande." }, 413);
  const admin = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return reply({ error: "Sesión inválida." }, 401);
  let body;
  try { body = await request.json(); } catch { return reply({ error: "Solicitud inválida." }, 400); }
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_ORDER_TEXT_LENGTH) return reply({ error: "El pedido debe tener entre 1 y 1500 caracteres." }, 400);
  try {
    const negocioId = await resolveAiTenant(admin, auth.user.id);
    const [{ data: products, error: productError }, { data: config, error: configError }] = await Promise.all([
      admin.from("productos").select("id,name,price,size").eq("negocio_id", negocioId),
      admin.from("negocio_configuracion").select("reglas_pedidos").eq("negocio_id", negocioId).maybeSingle(),
    ]);
    if (productError || configError) throw productError || configError;
    if (!products?.length) return reply({ error: "Este negocio no tiene productos disponibles." }, 400);
    const lines = await parseOrderWithGroq(text, products, buildBusinessPrompt(config?.reglas_pedidos), { maxCatalogSize: 100, maxCompletionTokens: 600 });
    return reply({ lines });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "TENANT_ACCESS_DENIED") return reply({ error: "El negocio o su suscripción no están activos para esta cuenta." }, 403);
    console.error("parse-order failed", code);
    return reply({ error: code === "GROQ_RATE_LIMIT" ? "La IA está ocupada. Intenta nuevamente en unos segundos." : "No fue posible interpretar el pedido. Intenta nuevamente." }, code === "GROQ_RATE_LIMIT" ? 429 : 502);
  }
});

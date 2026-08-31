// Supabase Edge Function: parse-order
// Recibe el texto libre de un pedido (escrito por un mesero desde el móvil)
// y el catálogo de productos disponible, y usa un modelo de IA gratuito
// (GPT-OSS 120B, open-weight, servido por Groq) para convertirlo en líneas
// de pedido estructuradas que el frontend pueda insertar en la mesa correspondiente.
//
// Deploy:
//   supabase functions deploy parse-order
// Secret requerido (obtén una API key gratuita en https://console.groq.com):
//   supabase secrets set GROQ_API_KEY=tu_api_key

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GROQ_MODEL = "openai/gpt-oss-120b";
const MAX_TEXT_LENGTH = 1500;
const MAX_CATALOG_SIZE = 400;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function buildSystemPrompt() {
  return `Eres un asistente que ayuda a interpretar pedidos de clientes de un restaurante, escritos en texto libre por un mesero desde su celular.

Recibirás primero "catalogo", una lista completa de productos disponibles. Cada entrada tiene la forma [referencia, nombre, tamaño]. "referencia" es un número entero que identifica temporalmente el producto y "tamaño" puede ser null. Después recibirás "pedido", el texto escrito por el mesero.

Tu tarea es devolver ÚNICAMENTE un objeto JSON (sin texto adicional, sin markdown) con esta forma exacta:
{"lines": [{"product_ref": 0, "qty": 1, "note": "", "unmatched_name": null}]}

Reglas:
1. Usa SOLO referencias numéricas que existan literalmente en "catalogo". Nunca inventes una referencia. Si no hay una coincidencia razonable, usa "product_ref": null.
2. "qty" es un número; si no se especifica cantidad, usa 1. Se permiten medios (0.5) SOLO para el caso de pizzas mitad y mitad (regla 4).
3. Si el texto describe un producto que no tiene una coincidencia razonable en el catálogo, agrega una línea con "product_ref": null, "qty" estimada, y "unmatched_name" con una descripción corta y clara de lo que pidió el cliente, para que el mesero la revise manualmente.
4. Caso especial "mitad y mitad" en pizzas (ej: "pizza grande mitad hawaiana mitad mexicana"): genera DOS líneas, una por cada sabor, cada una con el producto de ese sabor y tamaño correspondiente del catálogo, "qty": 0.5, y en "note" escribe "Mitad y mitad" en ambas para que quede claro en cocina que es una sola pizza dividida.
5. Usa el campo "size" y el tamaño mencionado en el nombre del producto (ej. "(Grande)", "(Personal)") para elegir la variante correcta cuando el cliente menciona un tamaño (grande, mediana, personal, extragrande, porción, litros, etc).
6. Si el cliente pide varias unidades de lo mismo (ej: "2 coca colas"), agrupa en una sola línea con la qty correspondiente.
7. Usa "note" para detalles relevantes que no cambian el producto pero sí la preparación (ej: "sin cebolla", "para llevar"). Deja "note": "" si no aplica.
8. No agregues productos que el cliente no pidió. No agregues explicaciones fuera del JSON.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }

  let body: { text?: unknown; products?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Cuerpo de solicitud inválido." }, 400);
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const products = Array.isArray(body.products) ? body.products : [];

  if (!text) {
    return jsonResponse({ error: "El pedido está vacío." }, 400);
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return jsonResponse({ error: "El pedido es demasiado largo." }, 400);
  }
  if (products.length === 0) {
    return jsonResponse({ error: "No hay catálogo de productos disponible." }, 400);
  }

  const catalog = products
    .map((p: Record<string, unknown>) => ({
      id: String(p.id ?? ""),
      name: String(p.name ?? ""),
      size: p.size ?? null,
    }))
    .filter((p) => p.id && p.name)
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, MAX_CATALOG_SIZE);

  const catalogWithRefs = catalog.map((product, productRef) => ({
    ...product,
    productRef,
  }));
  const compactCatalog = catalogWithRefs.map(({ productRef, name, size }) => [productRef, name, size]);

  // Nombre del secreto tal como quedó guardado en el dashboard de Supabase.
  const apiKey = Deno.env.get("GROQ_API_KEY") || Deno.env.get("GROQ_API_KEY_SABOR_LATINO_MOBILE");
  if (!apiKey) {
    return jsonResponse(
      { error: "Falta configurar GROQ_API_KEY en los secretos de la función." },
      500
    );
  }

  let aiResponse: Response;
  try {
    aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.1,
        reasoning_effort: "low",
        max_completion_tokens: 600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          {
            role: "user",
            content: JSON.stringify({ catalogo: compactCatalog }),
          },
          { role: "user", content: JSON.stringify({ pedido: text }) },
        ],
      }),
    });
  } catch {
    return jsonResponse({ error: "No se pudo contactar al modelo de IA." }, 502);
  }

  if (!aiResponse.ok) {
    if (aiResponse.status === 429) {
      return jsonResponse(
        { error: "Se alcanzó temporalmente el límite gratuito de IA. Intenta nuevamente en unos segundos." },
        429
      );
    }
    return jsonResponse({ error: "El modelo de IA rechazó la solicitud." }, 502);
  }

  const aiPayload = await aiResponse.json().catch(() => null);
  const usage = aiPayload?.usage;
  const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? usage?.cached_tokens;
  console.log("groq usage:", JSON.stringify({
    prompt_tokens: usage?.prompt_tokens,
    completion_tokens: usage?.completion_tokens,
    total_tokens: usage?.total_tokens,
    cached_tokens: cachedTokens,
  }));
  const rawContent: string | undefined = aiPayload?.choices?.[0]?.message?.content;

  if (!rawContent) {
    return jsonResponse({ error: "El modelo de IA no devolvió contenido." }, 502);
  }

  let parsed: { lines?: unknown };
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return jsonResponse({ error: "No se pudo interpretar la respuesta de la IA." }, 502);
  }

  const productIdByRef = new Map(catalogWithRefs.map((product) => [product.productRef, product.id]));
  const lines = Array.isArray(parsed.lines)
    ? parsed.lines
        .map((line: Record<string, unknown>) => {
          const productRef = line.product_ref;
          const productId =
            typeof productRef === "number" &&
            Number.isInteger(productRef) &&
            productIdByRef.has(productRef)
              ? productIdByRef.get(productRef)!
              : null;
          const qty = Number(line.qty);
          return {
            product_id: productId,
            qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
            note: typeof line.note === "string" ? line.note.trim() : "",
            unmatched_name:
              productId === null
                ? typeof line.unmatched_name === "string" && line.unmatched_name.trim()
                  ? line.unmatched_name.trim()
                  : "Producto no identificado"
                : null,
          };
        })
        .filter((line) => line.product_id || line.unmatched_name)
    : [];

  return jsonResponse({ lines });
});

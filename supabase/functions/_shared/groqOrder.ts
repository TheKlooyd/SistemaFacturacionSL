export const MAX_ORDER_TEXT_LENGTH = 1500;
const MAX_CATALOG_SIZE = 60;

export function pickRelevantProducts(text: string, products: Array<Record<string, unknown>>) {
  const terms = new Set(text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) || []);
  return products
    .map((product) => ({ ...product, score: (String(product.name || "").toLowerCase().match(/[a-z0-9]+/g) || []).filter((word) => terms.has(word)).length }))
    .sort((left, right) => right.score - left.score || String(left.id).localeCompare(String(right.id)))
    .slice(0, MAX_CATALOG_SIZE);
}

export async function parseOrderWithGroq(text: string, products: Array<Record<string, unknown>>, prompt: string) {
  const apiKey = Deno.env.get("GROQ_API_KEY") || Deno.env.get("GROQ_API_KEY_SABOR_LATINO_MOBILE");
  if (!apiKey) throw new Error("GROQ_NOT_CONFIGURED");
  const catalog = pickRelevantProducts(text, products).map((product, productRef) => ({ id: String(product.id), name: String(product.name), size: product.size ?? null, productRef }));
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai/gpt-oss-120b", temperature: 0.1, reasoning_effort: "low", max_completion_tokens: 600, response_format: { type: "json_object" }, messages: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify({ catalogo: catalog.map(({ productRef, name, size }) => [productRef, name, size]) }) }, { role: "user", content: JSON.stringify({ pedido: text }) }] }),
  });
  if (!response.ok) throw new Error(response.status === 429 ? "GROQ_RATE_LIMIT" : "GROQ_ERROR");
  const content = (await response.json())?.choices?.[0]?.message?.content;
  const parsed = JSON.parse(content || "{}");
  return (Array.isArray(parsed.lines) ? parsed.lines : []).map((line: Record<string, unknown>) => {
    const ref = line.product_ref;
    const product = typeof ref === "number" && Number.isInteger(ref) ? catalog.find((item) => item.productRef === ref) : null;
    const qty = Number(line.qty);
    return { product_id: product?.id || null, qty: Number.isFinite(qty) && qty > 0 && qty <= 100 ? qty : 1, note: typeof line.note === "string" ? line.note.trim().slice(0, 300) : "", unmatched_name: product ? null : (typeof line.unmatched_name === "string" ? line.unmatched_name.trim().slice(0, 120) || "Producto no identificado" : "Producto no identificado") };
  }).filter((line) => line.product_id || line.unmatched_name);
}
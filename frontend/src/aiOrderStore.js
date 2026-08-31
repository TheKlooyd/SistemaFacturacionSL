import { supabase } from "./supabaseClient";

const MAX_CATALOG_ITEMS = 60;

const STOPWORDS = new Set([
  "una", "uno", "unos", "unas", "el", "la", "los", "las", "de", "del", "al",
  "con", "sin", "para", "por", "y", "o", "que", "en", "un", "mas", "más",
  "le", "les", "su", "sus", "este", "esta", "estos", "estas", "quiere",
  "quiero", "pedido", "pide", "mesa", "porfa", "favor", "gracias",
]);

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
}

function tokenize(str) {
  return normalize(str)
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Groq's free tier caps requests at ~8000 tokens/min, and a full catalog of
 * 200+ products blows past that. Pre-filter to the products whose name shares
 * a word with the order text (cheap local keyword match, no AI involved), so
 * the request sent to the model stays small no matter how big the menu grows.
 * Anything genuinely not in the shortlist still comes back as unmatched_name
 * from the model, so the waiter can add it manually.
 */
function pickRelevantProducts(text, products, maxItems = MAX_CATALOG_ITEMS) {
  const words = tokenize(text);
  if (products.length <= maxItems || words.length === 0) {
    return products.slice(0, maxItems);
  }

  const scored = products.map((p) => {
    const nameWords = tokenize(p.name);
    const score = words.reduce(
      (acc, w) => acc + (nameWords.some((nw) => nw.includes(w) || w.includes(nw)) ? 1 : 0),
      0
    );
    return { product: p, score };
  });

  const matched = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.product);

  if (matched.length >= maxItems) return matched.slice(0, maxItems);

  const matchedIds = new Set(matched.map((p) => p.id));
  const rest = products.filter((p) => !matchedIds.has(p.id));
  return [...matched, ...rest].slice(0, maxItems);
}

/**
 * Sends free-text order description + product catalog to the `parse-order`
 * Supabase Edge Function, which uses an AI model to turn it into structured
 * order lines: [{ product_id, qty, note, unmatched_name }]
 */
export async function parseOrderWithAI(text, products) {
  const shortlist = pickRelevantProducts(text, products || []);
  const catalog = shortlist.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
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

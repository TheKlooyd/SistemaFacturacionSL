export const MAX_ORDER_TEXT_LENGTH = 1500;
export const MAX_CATALOG_SIZE = 100;

type CatalogProduct = Record<string, unknown>;

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: unknown) {
  return normalize(value).match(/[a-z0-9]+/g) || [];
}

function editDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1);
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        substitution
      );
    }
    previous = current;
  }

  return previous[right.length];
}

function closeTokenMatch(queryToken: string, productToken: string) {
  if (queryToken === productToken) return 12;
  if (queryToken.length >= 3 && productToken.length >= 3) {
    if (queryToken.startsWith(productToken) || productToken.startsWith(queryToken)) return 7;
    if (queryToken.includes(productToken) || productToken.includes(queryToken)) return 5;

    const allowedDistance = Math.max(queryToken.length, productToken.length) >= 8 ? 2 : 1;
    if (editDistance(queryToken, productToken) <= allowedDistance) return 4;
  }
  return 0;
}

function expandedQueryTerms(text: string) {
  const normalizedText = normalize(text);
  const expanded = new Set(tokens(normalizedText));

  const add = (...values: string[]) => values.forEach((value) => expanded.add(value));
  const sodaIntent = /\b(gaseos\w*|refresc\w*|coca\w*|cocacola|postobon|colombiana|pepsi|manzana|uva)\b/.test(normalizedText);

  if (sodaIntent) add("gas", "gaseosa");
  if (sodaIntent && /\b(grande|familiar|1 5|1500|litro y medio)\b/.test(normalizedText)) {
    add("familiar", "1", "5");
  }
  if (sodaIntent && /\b(personal|400|pequena)\b/.test(normalizedText)) add("personal", "400");
  if (sodaIntent && /\b(mini|200|pequenita)\b/.test(normalizedText)) add("mini", "200");
  if (/\b(hamburgesa|amburguesa|hamburguesa|burger)\b/.test(normalizedText)) add("hamburguesa");
  if (/\b(salchi\w*|salchipapa)\b/.test(normalizedText)) add("salchipapa");
  if (/\b(peperoni|pepperoni)\b/.test(normalizedText)) add("pepperoni");
  if (/\b(champis|champinon|champinones)\b/.test(normalizedText)) add("champinones");
  if (/\b(yuquita|yuquitas|yukita|yukitas)\b/.test(normalizedText)) add("yukitas");
  if (/\b(mostaneza|mostanezza)\b/.test(normalizedText)) add("mostanezza");

  return { normalizedText, terms: [...expanded], sodaIntent };
}

function isPinnedProduct(normalizedText: string, productName: string, sodaIntent: boolean) {
  if (sodaIntent && /^(gas familiar 1 5 l|gas personal 400 ml|gas mini 200ml|gaseosa 3 0)$/.test(productName)) {
    return true;
  }

  if (/\bagua\b/.test(normalizedText) && /^(gas|natural|saborizada)$/.test(productName)) return true;
  if (/\b(mr tea|mister te|mr te|te frio)\b/.test(normalizedText) && productName === "mr te") return true;
  if (/\bcombo\b/.test(normalizedText) && /^combo (personal|para dos)$/.test(productName)) return true;
  if (/\bmichelad\w*\b/.test(normalizedText) && productName === "michelada") return true;

  return false;
}

export function pickRelevantProducts(text: string, products: CatalogProduct[]) {
  const { normalizedText, terms, sodaIntent } = expandedQueryTerms(text);

  const scored = products.map((product) => {
    const productName = normalize(product.name);
    const productTokens = tokens(productName);
    let score = 0;

    for (const queryToken of terms) {
      score += productTokens.reduce(
        (best, productToken) => Math.max(best, closeTokenMatch(queryToken, productToken)),
        0
      );
    }

    if (productName && normalizedText.includes(productName)) score += 30;

    return {
      product,
      pinned: isPinnedProduct(normalizedText, productName, sodaIntent),
      score,
      stableId: String(product.id ?? product.name ?? ""),
    };
  });

  scored.sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    return right.score - left.score || left.stableId.localeCompare(right.stableId);
  });

  return scored.slice(0, MAX_CATALOG_SIZE).map(({ product }) => product);
}

export async function parseOrderWithGroq(
  text: string,
  products: CatalogProduct[],
  prompt: string
) {
  const apiKey = Deno.env.get("GROQ_API_KEY") || Deno.env.get("GROQ_API_KEY_SABOR_LATINO_MOBILE");
  if (!apiKey) throw new Error("GROQ_NOT_CONFIGURED");

  const catalog = pickRelevantProducts(text, products)
    .map((product, productRef) => ({
      id: String(product.id ?? ""),
      name: String(product.name ?? ""),
      size: product.size ?? null,
      productRef,
    }))
    .filter((product) => product.id && product.name);

  if (catalog.length === 0) throw new Error("EMPTY_CATALOG");

  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        temperature: 0.1,
        reasoning_effort: "low",
        max_completion_tokens: 600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: JSON.stringify({
              catalogo: catalog.map(({ productRef, name, size }) => [productRef, name, size]),
            }),
          },
          { role: "user", content: JSON.stringify({ pedido: text }) },
        ],
      }),
    });
  } catch {
    throw new Error("GROQ_NETWORK_ERROR");
  }

  if (!response.ok) {
    throw new Error(response.status === 429 ? "GROQ_RATE_LIMIT" : "GROQ_ERROR");
  }

  const payload = await response.json().catch(() => null);
  const usage = payload?.usage;
  console.log("groq usage:", JSON.stringify({
    prompt_tokens: usage?.prompt_tokens,
    completion_tokens: usage?.completion_tokens,
    total_tokens: usage?.total_tokens,
    cached_tokens: usage?.prompt_tokens_details?.cached_tokens ?? usage?.cached_tokens,
  }));

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content) throw new Error("GROQ_EMPTY_RESPONSE");

  let parsed: { lines?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("GROQ_INVALID_JSON");
  }

  if (!Array.isArray(parsed.lines)) return [];

  return parsed.lines
    .filter((line): line is Record<string, unknown> => Boolean(line) && typeof line === "object")
    .map((line) => {
      const reference = line.product_ref;
      const product = typeof reference === "number" && Number.isInteger(reference)
        ? catalog[reference]
        : undefined;
      const requestedQuantity = Number(line.qty);
      const quantity = Number.isFinite(requestedQuantity)
        && requestedQuantity > 0
        && requestedQuantity <= 100
        ? requestedQuantity
        : 1;

      return {
        product_id: product?.id || null,
        qty: quantity,
        note: typeof line.note === "string" ? line.note.trim().slice(0, 300) : "",
        unmatched_name: product
          ? null
          : typeof line.unmatched_name === "string" && line.unmatched_name.trim()
            ? line.unmatched_name.trim().slice(0, 120)
            : "Producto no identificado",
      };
    })
    .filter((line) => line.product_id || line.unmatched_name);
}

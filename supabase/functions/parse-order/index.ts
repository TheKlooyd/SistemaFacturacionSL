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

import { pickRelevantProducts } from "../_shared/groqOrder.ts";

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

export function buildSystemPrompt() {
  return `Eres un asistente que interpreta pedidos de un restaurante escritos rápidamente por un mesero desde su celular.

Recibirás:
1. "catalogo": lista de productos disponibles con la forma [referencia, nombre, tamaño].
2. "pedido": texto libre escrito por el mesero.

Devuelve ÚNICAMENTE JSON válido, sin markdown, explicaciones ni texto adicional, con esta estructura exacta:
{"lines":[{"product_ref":0,"qty":1,"note":"","unmatched_name":null}]}

PROCESO OBLIGATORIO:
1. Divide el pedido en productos independientes.
2. Para cada producto identifica primero la familia: pizza, hamburguesa, perro, salchipapa, gaseosa, agua, jugo, frappé, limonada, cerveza, alitas, asado, pasta, lasaña, combo, entrada, picada, adición o domicilio.
3. Después identifica la variante: sabor, tamaño, cantidad, salsa, preparación, proteína o presentación.
4. Selecciona únicamente una referencia que exista literalmente en el catálogo.
5. Si no existe una coincidencia razonable o falta información indispensable, usa "product_ref": null y explica brevemente el producto en "unmatched_name".

TOLERANCIA DE ESCRITURA:
6. Tolera errores ortográficos, palabras incompletas, falta de tildes, letras intercambiadas, abreviaciones, singular, plural y escritura fonética.
Ejemplos: "hamburgesa", "amburguesa", "ham", "perro esp", "salchi", "yuquitas", "mostaneza", "peperoni", "cocacola", "gas fam", "1,5", "litro y medio", "extra grande", "champis".
7. No exijas coincidencia literal con el nombre del catálogo. Usa el contexto para encontrar el producto equivalente.
8. No confundas palabras genéricas. "Sencilla", "Especial", "Mixta", "Natural", "Manzana", "BBQ", "Pollo Champiñones" o "Mango" pueden representar productos diferentes. Usa las palabras cercanas para identificar la familia.
9. Si una expresión sigue siendo ambigua, no adivines. Usa "product_ref": null.

CANTIDADES Y NOTAS:
10. Si no se especifica cantidad, usa qty 1.
11. Agrupa unidades del mismo producto solamente cuando también tengan la misma nota.
12. Si dos unidades iguales tienen sabores, salsas o instrucciones diferentes, genera líneas separadas.
13. Usa "note" para sabor, salsa, proteína, tipo de pasta, instrucciones de preparación o detalles como "sin cebolla" y "para llevar".
14. Si el producto fue identificado, "unmatched_name" debe ser null.
15. No agregues ingredientes, acompañamientos ni productos que el cliente no pidió.

GASEOSAS:
16. Estos son productos diferentes:
- "Gas mini 200ML": gaseosa mini de 200 ml.
- "Gas Personal 400 ml": gaseosa personal.
- "Gas Familiar 1.5 L": gaseosa familiar de 1.5 litros.
- "gaseosa 3.0": gaseosa de 3 litros.

17. Normaliza los tamaños así:
- "mini", "pequeñita", "200", "200 ml" -> "Gas mini 200ML".
- "personal", "pequeña", "400", "400 ml", "pet 400" -> "Gas Personal 400 ml".
- "familiar", "grande", "1.5", "1,5", "1.5l", "1500 ml", "litro y medio", "pet familiar" -> "Gas Familiar 1.5 L".
- "3 litros", "3.0", "tres litros", "super familiar" -> "gaseosa 3.0".
- Si solamente dice "gaseosa", "gas" o "refresco" sin tamaño, usa "Gas Personal 400 ml".

18. Cuando el pedido indique una gaseosa familiar o grande, selecciona siempre "Gas Familiar 1.5 L", aunque el mesero escriba otro nombre como:
"coca 1.5", "cocacola familiar", "manzana grande", "postobón familiar", "colombiana litro y medio" o expresiones equivalentes.

19. La marca o sabor de la gaseosa no es un producto diferente. Guárdalo en "note":
- Coca, Coca-Cola, Coca Cola o cocacola -> "Sabor: Coca-Cola".
- Manzana o manz -> "Sabor: Manzana".
- Colombiana -> "Sabor: Colombiana".
- Uva -> "Sabor: Uva".
- Naranja -> "Sabor: Naranja".
- Pepsi -> "Sabor: Pepsi".
- Postobón sin sabor específico -> "Marca: Postobón".
- Otro sabor o marca claramente indicado -> "Sabor: [nombre normalizado]".

20. Si no especifica sabor, deja "note": "".
21. Si solicita varios sabores, genera líneas separadas aunque todas usen la misma referencia.
Ejemplo: "una manzana y una colombiana familiares" produce dos líneas de "Gas Familiar 1.5 L", cada una con su nota correspondiente.

AGUAS Y TÉ:
22. No confundas gaseosa con agua:
- "agua con gas", "agua gasificada" -> producto "GAS".
- "agua natural", "agua sin gas", "botella de agua" -> producto "NATURAL".
- "agua saborizada" -> producto "SABORIZADA".
- "gaseosa", "gas personal" o "gas familiar" nunca deben seleccionar el producto de agua llamado "GAS".
23. "Mr Tea", "Mister Té", "Mr Té" o "té frío" -> producto "MR TE".

PIZZAS:
24. Identifica siempre sabor y tamaño. Los tamaños equivalentes son:
- "porción", "pedazo", "slice" -> Porción.
- "personal", "para uno", "4p" -> Personal.
- "mediana", "6p" -> Mediana.
- "grande", "8p" -> Grande.
- "extragrande", "extra grande", "XL", "12p" -> Extragrande.

25. Si dice "pizza para 8" o "pizza de 8 porciones", interpreta una pizza Grande. Si dice "8 porciones individuales", usa qty 8 de la variante Porción.
26. Reconoce sabores aunque estén abreviados o mal escritos: Hawaiana, Pepperoni, Jamón y Queso, Vegetariana, Bocadillo, Margarita, BBQ, Clásica, Costilla y Cabano, Maduro Tocineta, Maíz Tocineta, Mostanezza, Petete, Pollo Champiñones, Pollo Jamón, Pollo a la Naranja, Sensación, Arcoíris, Carnes, Casual, Criolla, Manzana, Mexicana, Mixta y Pizza Latina.
27. "Manzana" es sabor de pizza solamente cuando el contexto indica pizza y tamaño. "Pizza manzana grande" selecciona la Pizza de la Casa - Manzana (Grande). "Manzana familiar" es una gaseosa familiar con nota "Sabor: Manzana".
28. "BBQ" es pizza cuando el contexto dice pizza. En alitas o asados representa una salsa y debe ir en "note".
29. "Pollo Champiñones" puede ser pizza o lasaña. Usa la palabra pizza, lasaña y el tamaño para distinguir.
30. "Pollo a la Naranja" es pizza cuando incluye pizza o un tamaño de pizza. En alitas o asados es una salsa.

MITAD Y MITAD:
31. Si dice "mitad y mitad", "miti miti", "50/50", "dos sabores" o equivalente, genera DOS líneas, una por sabor, con qty 0.5.
32. Ambas líneas deben usar el tamaño solicitado y tener "note": "Mitad y mitad".
33. No conviertas una pizza mitad y mitad en dos pizzas completas.
34. Solo aplica la división cuando el pedido indique claramente que se trata de una sola pizza dividida.

COMBOS:
35. "Combo Personal" y "Combo Para Dos" son productos completos. Si el cliente pide un combo, selecciona solamente la referencia del combo. No agregues por separado hamburguesa, papas ni gaseosa.
36. Guarda las elecciones del combo en la nota.
Ejemplos:
- "combo personal de pollo con manzana" -> Combo Personal, note "Hamburguesa: Pollo; Gaseosa: Manzana".
- "combo para dos, una coca y una manzana" -> Combo Para Dos, note "Gaseosas: Coca-Cola y Manzana".
37. La gaseosa incluida en un combo no debe generar una línea adicional, salvo que el mesero diga explícitamente que desea una gaseosa adicional.
38. El producto "adicion gaseosa" solo se selecciona cuando el pedido diga explícitamente "adición de gaseosa", "gaseosa adicional" o "agrandar/cambiar la gaseosa pagando adición".

HAMBURGUESAS, PERROS Y SALCHIPAPAS:
39. "Sencilla", "Especial" y "Mixta" no son suficientes por sí solas:
- "hamburguesa sencilla" -> Hamburguesa Sencilla.
- "perro sencillo" -> Perro Sencillo.
- "salchipapa sencilla" -> Salchipapa Sencilla.
- "especial" sin indicar hamburguesa, perro, ensalada u otro tipo -> producto no identificado.

40. Para Hamburguesa Sencilla o Especial, si especifica carne o filete de pollo apanado, conserva el mismo producto y guarda la elección en "note":
- "de carne" -> "Proteína: Carne".
- "de pollo", "pollo apanado" -> "Proteína: Filete de pollo apanado".
41. Hamburguesa Mixta ya incluye carne y pollo. No agregues productos separados.
42. Distingue Hamburguesa Mixta, Hamburguesa Mixta Especial, Perro Especial, Perro Ranchero Especial y Salchipapa Gratinada por el tipo indicado.

ALITAS Y ASADOS:
43. Las alitas se venden únicamente en x4, x8, x12, x16, x20 y x24.
44. Convierte "una docena" en Alitas x12 y "dos docenas" en Alitas x24.
45. "Media docena" equivale a 6, presentación que no existe. En ese caso usa product_ref null en lugar de escoger x4 o x8.
46. Las salsas BBQ, Miel Mostaza, Picantes, Natural, BBQ Picantes y A la Naranja no son productos separados. Guárdalas en "note".
Ejemplo: "8 alitas BBQ picantes" -> Alitas x8, note "Salsa: BBQ Picantes".
47. En Costillas 200g, Filete de Pollo Asado 200g o Filete de Res Asado 200g, guarda la salsa solicitada en "note".
48. No confundas salsa Natural con el producto de agua llamado "NATURAL".

JUGOS, FRAPPÉS, LIMONADAS Y BEBIDAS CALIENTES:
49. Para jugos naturales selecciona la variante exacta "en Agua" o "en Leche".
Ejemplos:
- "jugo de mango en leche" -> Jugo de Mango en Leche.
- "mora en agua" -> Jugo de Mora en Agua.
50. Si solamente escribe un sabor como "mango", "mora", "fresa", "lulo", "maracuyá", "guanábana", "borojó", "coronilla" o "Milo" sin indicar bebida o preparación, no adivines entre jugo, frappé, limonada o gaseosa.
51. "frappé", "frape", "frappé de..." o "frozen" selecciona el Frappé correspondiente.
52. "mango biche" selecciona Limonada Mango Biche cuando el contexto indique limonada.
53. "limonada natural" selecciona Limonada Natural. No debe seleccionar el agua "NATURAL" ni una salsa Natural.
54. "jarra de limonada" selecciona "jarra limonada". No la confundas con una limonada individual.
55. "café", "tinto", "café negro" -> "cafe negro".
56. "café con leche" -> "cafe leche".
57. "frappé de café" -> "Frappé de Café".
58. "Milo caliente" -> "milo caliente". "Frappé de Milo" es otro producto diferente.

PASTAS Y LASAÑAS:
59. En pastas, el producto del catálogo representa la salsa: Boloñesa, Carbonara, Amatriciana, Pollo al Pesto o Camarón.
60. El tipo de pasta se guarda en "note":
- Fetuccini, fettuccine o fetuchini -> "Pasta: Fetuccini".
- Espagueti, spaghetti o spagueti -> "Pasta: Espagueti".
Ejemplo: "espagueti carbonara" -> Pasta Carbonara, note "Pasta: Espagueti".
61. No confundas Pasta Pollo al Pesto con pizzas de pollo.
62. Distingue Lasaña Mixta, Lasaña de Pollo, Lasaña de Carne, Lasaña Vegetariana y Lasaña Pollo y Champiñones.
63. "Pollo y champiñones" sin decir pizza o lasaña es ambiguo y no debe adivinarse.

CERVEZAS:
64. Reconoce Poker, Tecate, Budweiser y Águila Light aunque estén abreviadas o mal escritas.
65. "Poker michelada", "Tecate michelada" o equivalente genera DOS líneas: una para la cerveza y otra para el producto "Michelada".
66. "Michelada" es una adición y no sustituye la cerveza.

PICADAS, ENTRADAS Y OTROS:
67. "picada para 2", "para dos" o "2-3 personas" -> Picada 2 - 3 Personas.
68. "picada para 4", "para tres", "para cuatro" o "3-4 personas" -> Picada 3 - 4 Personas.
69. Si dice solamente "picada" sin cantidad de personas, no adivines el tamaño.
70. Reconoce "yuquitas", "yukitas", "yucas x5" como "Yukitas x5 und.".
71. "moneditas", "monedas de plátano" o errores equivalentes -> Moneditas de Plátano.
72. "papas", "papas francesas" o "porción de papas" -> Papas a la Francesa, salvo que el contexto indique salchipapa, combo o picada.
73. "recipiente llevar" solo se agrega cuando el mesero diga explícitamente "agregar recipiente", "cobrar recipiente" o equivalente. La frase "para llevar" por sí sola debe guardarse como nota y no debe generar automáticamente el cobro.
74. Los productos Domicilio, domicilio norte y domicilio sur solo se seleccionan cuando el pedido solicite explícitamente agregar el costo del domicilio.
75. "Plato" solo se selecciona si se indica explícitamente un cobro por plato roto o dañado.
76. Nunca selecciones "producto prueba" a menos que el mesero escriba exactamente que necesita el producto de prueba.
77. "promo pizza" solo se selecciona cuando el pedido mencione explícitamente la promoción.
78. Las adiciones de queso, vegetal o proteína solo se agregan si el mesero usa palabras como "adición", "adicional", "extra", "agregar" o "con costo adicional".

EJEMPLOS FINALES:
- "2 coca 1.5" -> Gas Familiar 1.5 L, qty 2, note "Sabor: Coca-Cola".
- "manzana familiar y pizza manzana grande" -> una gaseosa familiar con nota Manzana y una Pizza de la Casa - Manzana (Grande).
- "una gas" -> Gas Personal 400 ml.
- "agua con gas" -> producto GAS.
- "combo personal pollo manzana" -> solamente Combo Personal con las elecciones en note.
- "8 alitas bbq picantes" -> Alitas x8 con salsa en note.
- "espagueti carbonara para llevar" -> Pasta Carbonara con note "Pasta: Espagueti; Para llevar".
- "una sencilla" -> producto no identificado porque puede ser hamburguesa, perro o salchipapa.

REGLAS FINALES:
79. Usa únicamente referencias existentes en el catálogo.
80. Nunca inventes productos, referencias, tamaños o presentaciones.
81. No uses ingredientes incluidos en las descripciones como productos independientes.
82. No agregues explicaciones fuera del JSON.
83. Si no hay coincidencia segura, es preferible devolver product_ref null antes que facturar el producto incorrecto.`;
}

if (import.meta.main) Deno.serve(async (req: Request) => {
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

  const catalog = pickRelevantProducts(text, products)
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

const LS_PRODUCTS = "pos_products_v2";
const LS_CATEGORIES = "mini_pos_categories_v1";

/**
 * En dev (Vite), el API está en el backend (puerto 3001), no en el servidor de Vite (5173).
 * En producción, el frontend y el backend comparten el mismo origen.
 * Usamos window.location.hostname para que funcione también desde otros dispositivos en la red.
 */
const API_BASE = import.meta.env.DEV
  ? `${location.protocol}//${location.hostname}:3001`
  : "";

// ---------- Products ----------
function loadProductsRaw() {
  try {
    const raw2 = localStorage.getItem(LS_PRODUCTS);
    if (raw2) return JSON.parse(raw2);

    // Legacy key (por si existía)
    const legacy = localStorage.getItem("pos_products_v1");
    return legacy ? JSON.parse(legacy) : [];
  } catch {
    return [];
  }
}

export function loadProducts() {
  return loadProductsRaw();
}

/**
 * Sincroniza el estado actual de localStorage (categorías + productos) al JSON del servidor.
 * Se ejecuta como fire-and-forget; los fallos de red son silenciosos.
 */
export async function syncToServer() {
  try {
    const products = loadProductsRaw();
    const categories = (() => {
      try {
        return JSON.parse(localStorage.getItem(LS_CATEGORIES) || "[]");
      } catch {
        return [];
      }
    })();
    await fetch(`${API_BASE}/products-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories, products }),
    });
  } catch {
    // localStorage es la fuente de verdad; el fallo de red es silencioso
  }
}

export function saveProducts(products) {
  localStorage.setItem(LS_PRODUCTS, JSON.stringify(products));
  syncToServer(); // fire-and-forget: actualiza el JSON del servidor
}

/**
 * Siempre carga productos y categorías desde el JSON del servidor al arrancar.
 * El servidor es la fuente de verdad; localStorage actúa solo como caché.
 * Si el servidor falla, se usa lo que haya en localStorage como fallback.
 */
export async function loadFromServerIfEmpty() {
  try {
    const res = await fetch(`${API_BASE}/products-data`);
    if (!res.ok) return loadProductsRaw();
    const data = await res.json();
    if (
      Array.isArray(data.products) && data.products.length > 0 &&
      Array.isArray(data.categories) && data.categories.length > 0
    ) {
      // Guardar en localStorage directamente (sin re-triggering syncToServer)
      localStorage.setItem(LS_PRODUCTS, JSON.stringify(data.products));
      localStorage.setItem(LS_CATEGORIES, JSON.stringify(data.categories));
      return data.products;
    }
  } catch {
    // fail silently
  }
  return current;
}

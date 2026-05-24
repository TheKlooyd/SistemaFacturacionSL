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

const STATIC_PRODUCTS_URL = `${import.meta.env.BASE_URL}sabor_latino_jy_productos.json`;

/**
 * Carga productos y categorías al arrancar.
 * Prioridad: 1) API del backend  2) JSON estático en public/  3) localStorage
 */
export async function loadFromServerIfEmpty() {
  // 1) Intentar API del backend
  try {
    const res = await fetch(`${API_BASE}/products-data`);
    if (res.ok) {
      const data = await res.json();
      if (
        Array.isArray(data.products) && data.products.length > 0 &&
        Array.isArray(data.categories) && data.categories.length > 0
      ) {
        localStorage.setItem(LS_PRODUCTS, JSON.stringify(data.products));
        localStorage.setItem(LS_CATEGORIES, JSON.stringify(data.categories));
        return data.products;
      }
    }
  } catch {
    // fail silently
  }

  // 2) Fallback: JSON estático (funciona en GitHub Pages / hosting estático)
  try {
    const res = await fetch(STATIC_PRODUCTS_URL);
    if (res.ok) {
      const data = await res.json();
      if (
        Array.isArray(data.products) && data.products.length > 0 &&
        Array.isArray(data.categories) && data.categories.length > 0
      ) {
        localStorage.setItem(LS_PRODUCTS, JSON.stringify(data.products));
        localStorage.setItem(LS_CATEGORIES, JSON.stringify(data.categories));
        return data.products;
      }
    }
  } catch {
    // fail silently
  }

  // 3) Último recurso: localStorage
  return loadProductsRaw();
}

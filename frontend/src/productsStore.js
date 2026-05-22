const LS_CATEGORIES = "pos_categories_v1";
const LS_PRODUCTS = "pos_products_v2";

// ---------- Seed + Migración ----------
export function ensureSeedProducts() {
  // Cargar categorías
  let categories = loadCategories();
  if (categories.length === 0) {
    const unc = { id: crypto.randomUUID(), name: "Sin categoría" };
    saveCategories([unc]);
    categories = [unc];
  }

  // Cargar productos (v2 o legacy)
  const existing = loadProductsRaw();
  const uncId =
    categories.find((c) => c.name === "Sin categoría")?.id || categories[0].id;

  // Si no hay productos, seed inicial
  if (existing.length === 0) {
    const pizzas = { id: crypto.randomUUID(), name: "Pizzas" };
    const bebidas = { id: crypto.randomUUID(), name: "Bebidas" };

    // Evitar duplicar "Sin categoría"
    const base = categories.filter((c) => c.name !== "Sin categoría");
    saveCategories([pizzas, bebidas, ...base, { id: uncId, name: "Sin categoría" }]);

    const finalCats = loadCategories();
    const pizzasId = finalCats.find((c) => c.name === "Pizzas")?.id;
    const bebidasId = finalCats.find((c) => c.name === "Bebidas")?.id;

    const seedProducts = [
      { id: crypto.randomUUID(), name: "Gaseosa", price: 5000, category_id: bebidasId },
      { id: crypto.randomUUID(), name: "Cerveza", price: 7000, category_id: bebidasId },
      { id: crypto.randomUUID(), name: "Pizza Margarita", price: 18000, category_id: pizzasId },
      { id: crypto.randomUUID(), name: "Pizza Hawaiana", price: 22000, category_id: pizzasId },
    ];

    saveProducts(seedProducts);

    return { categories: loadCategories(), products: loadProducts() };
  }

  // Migrar productos viejos sin category_id -> "Sin categoría"
  const migrated = existing.map((p) => ({
    ...p,
    category_id: p.category_id || uncId,
  }));
  saveProducts(migrated);

  return { categories: loadCategories(), products: loadProducts() };
}

// ---------- Categories ----------
export function loadCategories() {
  try {
    const raw = localStorage.getItem(LS_CATEGORIES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCategories(categories) {
  localStorage.setItem(LS_CATEGORIES, JSON.stringify(categories));
}

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

export function saveProducts(products) {
  localStorage.setItem(LS_PRODUCTS, JSON.stringify(products));
}

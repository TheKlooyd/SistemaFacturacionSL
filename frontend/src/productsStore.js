const LS_PRODUCTS = "pos_products_v2";

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

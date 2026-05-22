const KEY = "mini_pos_categories_v1";

export function loadCategories() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCategories(categories) {
  localStorage.setItem(KEY, JSON.stringify(categories));
}

export function ensureSeedCategories() {
  const current = loadCategories();
  if (current.length) return current;

  const seed = [
    { id: crypto.randomUUID(), name: "Pizzas" },
    { id: crypto.randomUUID(), name: "Bebidas" },
  ];
  saveCategories(seed);
  return seed;
}

export function addCategory(name) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Nombre inválido");

  const all = loadCategories();
  const exists = all.some((c) => c.name.toLowerCase() === clean.toLowerCase());
  if (exists) throw new Error("Esa categoría ya existe");

  const next = [{ id: crypto.randomUUID(), name: clean }, ...all];
  saveCategories(next);
  return next;
}

export function deleteCategory(categoryId, products = []) {
  const used = products.some((p) => p.category_id === categoryId);
  if (used) throw new Error("No puedes borrar una categoría con productos.");

  const all = loadCategories();
  const next = all.filter((c) => c.id !== categoryId);
  saveCategories(next);
  return next;
}

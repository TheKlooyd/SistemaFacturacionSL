import { supabase } from "./supabaseClient";

export async function loadCategories() {
  const { data, error } = await supabase
    .from("categorias")
    .select("*")
    .order("name");

  if (error) {
    console.error("loadCategories error:", error);
    return [];
  }
  return (data || []).map((c) => ({ id: c.id, name: c.name }));
}

export async function ensureSeedCategories() {
  const cats = await loadCategories();
  if (cats.length) return cats;

  const seed = [
    { id: crypto.randomUUID(), name: "Pizzas" },
    { id: crypto.randomUUID(), name: "Bebidas" },
  ];
  const { error } = await supabase.from("categorias").insert(seed);
  if (error) console.error("ensureSeedCategories error:", error);
  return await loadCategories();
}

export async function addCategory(name) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Nombre inválido");

  const all = await loadCategories();
  const exists = all.some(
    (c) => c.name.toLowerCase() === clean.toLowerCase()
  );
  if (exists) throw new Error("Esa categoría ya existe");

  const newCat = { id: crypto.randomUUID(), name: clean };
  const { error } = await supabase.from("categorias").insert(newCat);
  if (error) throw new Error(error.message);

  return await loadCategories();
}

export async function deleteCategory(categoryId, products = []) {
  const used = products.some((p) => p.category_id === categoryId);
  if (used) throw new Error("No puedes borrar una categoría con productos.");

  const { error } = await supabase
    .from("categorias")
    .delete()
    .eq("id", categoryId);
  if (error) throw new Error(error.message);

  return await loadCategories();
}

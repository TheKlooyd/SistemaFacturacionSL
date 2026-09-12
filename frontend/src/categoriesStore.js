import { supabase } from "./supabaseClient";
import { requireNegocioId } from "./tenantSession";

export async function loadCategories() {
  const negocioId = requireNegocioId();

  const { data, error } = await supabase
    .from("categorias")
    .select("*")
    .eq("negocio_id", negocioId)
    .order("name");

  if (error) {
    console.error("loadCategories error:", error);
    return [];
  }

  return (data || []).map((c) => ({
    id: c.id,
    name: c.name,
  }));
}

export async function ensureSeedCategories() {
  const negocioId = requireNegocioId();

  const cats = await loadCategories();

  if (cats.length) {
    return cats;
  }

  const seed = [
    {
      id: crypto.randomUUID(),
      negocio_id: negocioId,
      name: "Pizzas",
    },
    {
      id: crypto.randomUUID(),
      negocio_id: negocioId,
      name: "Bebidas",
    },
  ];

  const { error } = await supabase
    .from("categorias")
    .insert(seed);

  if (error) {
    console.error("ensureSeedCategories error:", error);
  }

  return await loadCategories();
}

export async function addCategory(name) {
  const negocioId = requireNegocioId();

  const clean = String(name || "").trim();

  if (!clean) {
    throw new Error("Nombre inválido");
  }

  const all = await loadCategories();

  const exists = all.some(
    (c) => c.name.toLowerCase() === clean.toLowerCase()
  );

  if (exists) {
    throw new Error("Esa categoría ya existe");
  }

  const newCat = {
    id: crypto.randomUUID(),
    negocio_id: negocioId,
    name: clean,
  };

  const { error } = await supabase
    .from("categorias")
    .insert(newCat);

  if (error) {
    throw new Error(error.message);
  }

  return await loadCategories();
}

export async function deleteCategory(categoryId, products = []) {
  const negocioId = requireNegocioId();

  const used = products.some(
    (p) => p.category_id === categoryId
  );

  if (used) {
    throw new Error(
      "No puedes borrar una categoría con productos."
    );
  }

  const { error } = await supabase
    .from("categorias")
    .delete()
    .eq("id", categoryId)
    .eq("negocio_id", negocioId);

  if (error) {
    throw new Error(error.message);
  }

  return await loadCategories();
}
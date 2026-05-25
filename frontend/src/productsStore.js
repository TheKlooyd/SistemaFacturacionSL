import { supabase } from "./supabaseClient";

export async function loadProducts() {
  const { data, error } = await supabase
    .from("productos")
    .select("*")
    .order("name");

  if (error) {
    console.error("loadProducts error:", error);
    return [];
  }
  return (data || []).map((p) => ({
    id: p.id,
    category_id: p.category_id,
    name: p.name,
    price: Number(p.price),
  }));
}

export async function addProduct(product) {
  const { error } = await supabase.from("productos").insert({
    id: product.id || crypto.randomUUID(),
    category_id: product.category_id,
    name: product.name,
    price: product.price,
  });
  if (error) console.error("addProduct error:", error);
  return await loadProducts();
}

export async function updateProduct(id, changes) {
  const { error } = await supabase
    .from("productos")
    .update(changes)
    .eq("id", id);
  if (error) console.error("updateProduct error:", error);
  return await loadProducts();
}

export async function deleteProduct(id) {
  const { error } = await supabase.from("productos").delete().eq("id", id);
  if (error) console.error("deleteProduct error:", error);
  return await loadProducts();
}

export async function deleteProductsByCategory(categoryId) {
  const { error } = await supabase
    .from("productos")
    .delete()
    .eq("category_id", categoryId);
  if (error) console.error("deleteProductsByCategory error:", error);
  return await loadProducts();
}

/** Kept for compatibility with older call sites */
export async function loadFromServerIfEmpty() {
  return await loadProducts();
}

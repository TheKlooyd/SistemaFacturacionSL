import { supabase } from "./supabaseClient";
import { requireNegocioId } from "./tenantSession";

export async function loadProducts() {
  const negocioId = requireNegocioId();

  const { data, error } = await supabase
    .from("productos")
    .select("*")
    .eq("negocio_id", negocioId)
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
    size: p.size ?? null,
  }));
}

export async function addProduct(product) {
  const negocioId = requireNegocioId();

  const { error } = await supabase
    .from("productos")
    .insert({
      id: product.id || crypto.randomUUID(),
      negocio_id: negocioId,
      category_id: product.category_id,
      name: product.name,
      price: product.price,
      size: product.size ?? null,
    });

  if (error) {
    console.error("addProduct error:", error);
  }

  return await loadProducts();
}

export async function updateProduct(id, changes) {
  const negocioId = requireNegocioId();

  // negocio_id nunca debe poder cambiarse desde una edición de producto.
  const safeChanges = { ...changes };

  delete safeChanges.id;
  delete safeChanges.negocio_id;

  const { error } = await supabase
    .from("productos")
    .update(safeChanges)
    .eq("id", id)
    .eq("negocio_id", negocioId);

  if (error) {
    console.error("updateProduct error:", error);
  }

  return await loadProducts();
}

export async function deleteProduct(id) {
  const negocioId = requireNegocioId();

  const { error } = await supabase
    .from("productos")
    .delete()
    .eq("id", id)
    .eq("negocio_id", negocioId);

  if (error) {
    console.error("deleteProduct error:", error);
  }

  return await loadProducts();
}

export async function deleteProductsByCategory(categoryId) {
  const negocioId = requireNegocioId();

  const { error } = await supabase
    .from("productos")
    .delete()
    .eq("category_id", categoryId)
    .eq("negocio_id", negocioId);

  if (error) {
    console.error(
      "deleteProductsByCategory error:",
      error
    );
  }

  return await loadProducts();
}
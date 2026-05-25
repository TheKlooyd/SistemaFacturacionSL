import { useEffect, useMemo, useState } from "react";
import {
  ensureSeedCategories,
  addCategory as addCategoryStore,
  deleteCategory as deleteCategoryStore,
} from "./categoriesStore";

import {
  loadProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  deleteProductsByCategory,
} from "./productsStore";

function formatCOP(value) {
  return new Intl.NumberFormat("es-CO").format(value || 0);
}

function requireKey(actionName = "esta acción") {
  const key = prompt(`Ingresa la clave de seguridad para ${actionName}:`);
  if (key !== "1207") {
    alert("Clave incorrecta. Acción cancelada.");
    return false;
  }
  return true;
}

export default function ProductAdmin({ onBack }) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);

  const [newCatName, setNewCatName] = useState("");

  const [selectedCatId, setSelectedCatId] = useState("");
  const selectedCat = useMemo(
    () => categories.find((c) => c.id === selectedCatId),
    [categories, selectedCatId]
  );

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  const [editingId, setEditingId] = useState(null);
  const isEditing = useMemo(() => Boolean(editingId), [editingId]);

  useEffect(() => {
    (async () => {
      const [cats, prods] = await Promise.all([
        ensureSeedCategories(),
        loadProducts(),
      ]);
      setCategories(cats);
      setProducts(prods);
      if (cats.length) setSelectedCatId(cats[0].id);
    })();
  }, []);

  function persistProducts(next) {
    setProducts(next);
  }

  function resetProductForm() {
    setName("");
    setPrice("");
    setEditingId(null);
  }

  const filteredProducts = useMemo(() => {
    if (!selectedCatId) return products;
    return products.filter((p) => p.category_id === selectedCatId);
  }, [products, selectedCatId]);

  async function handleCreateCategory(e) {
    e.preventDefault();
    try {
      const next = await addCategoryStore(newCatName);
      setCategories(next);
      setNewCatName("");
      if (!selectedCatId && next.length) setSelectedCatId(next[0].id);
    } catch (err) {
      alert(err?.message || "No se pudo crear la categoría.");
    }
  }

  async function handleDeleteCategory(catId) {
    if (!requireKey("eliminar una categoría")) return;

    const cat = categories.find((c) => c.id === catId);
    const ok = confirm(`¿Eliminar la categoría "${cat?.name || ""}"?`);
    if (!ok) return;

    try {
      const next = await deleteCategoryStore(catId, products);
      setCategories(next);

      if (selectedCatId === catId) {
        setSelectedCatId(next[0]?.id || "");
      }
    } catch (err) {
      alert(err?.message || "No se pudo borrar la categoría.");
    }
  }

  async function handleSubmitProduct(e) {
    e.preventDefault();

    const cleanName = name.trim();
    const numericPrice = Number(price);

    if (!selectedCatId) return alert("Primero selecciona/crea una categoría.");
    if (!cleanName) return alert("Pon un nombre de producto.");
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      return alert("Pon un precio válido (mayor a 0).");
    }

    if (isEditing) {
      const next = await updateProduct(editingId, {
        name: cleanName,
        price: numericPrice,
        category_id: selectedCatId,
      });
      persistProducts(next);
      resetProductForm();
      return;
    }

    const newProduct = {
      id: crypto.randomUUID(),
      category_id: selectedCatId,
      name: cleanName,
      price: numericPrice,
    };

    const next = await addProduct(newProduct);
    persistProducts(next);
    resetProductForm();
  }

  function startEdit(p) {
    setEditingId(p.id);
    setName(p.name);
    setPrice(String(p.price));
    if (p.category_id) setSelectedCatId(p.category_id);
  }

  async function removeProduct(id) {
    // aquí es el admin del catálogo: sí pedimos clave
    if (!requireKey("eliminar un producto")) return;

    const p = products.find((x) => x.id === id);
    if (!p) return;

    const ok = confirm(`¿Eliminar "${p.name}"?`);
    if (!ok) return;

    const next = await deleteProduct(id);
    persistProducts(next);
    if (editingId === id) resetProductForm();
  }

  async function clearAllInCategory() {
    if (!selectedCatId) return;
    if (!requireKey("borrar productos de la categoría")) return;

    const ok = confirm(
      `¿Borrar TODOS los productos de "${selectedCat?.name || "esta categoría"}"?`
    );
    if (!ok) return;

    const next = await deleteProductsByCategory(selectedCatId);
    persistProducts(next);
    resetProductForm();
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>Administrador de productos</h1>
        <div className="topbarActions">
          <button className="btn" onClick={onBack}>Volver</button>
        </div>
      </header>

      <div className="adminLayout">
        {/* CATEGORÍAS */}
        <section className="card adminPanel">
          <div className="panelTitle">Categorías</div>

          <form className="rowForm" onSubmit={handleCreateCategory}>
            <input
              className="input"
              placeholder="Ej: Pizzas"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
            />
            <button className="btnPrimary" type="submit">Crear</button>
          </form>

          <div className="catGrid">
            {categories.map((c) => {
              const active = c.id === selectedCatId;
              return (
                <div key={c.id} className={`catCard ${active ? "active" : ""}`}>
                  <button
                    className="catPick"
                    onClick={() => setSelectedCatId(c.id)}
                    title="Seleccionar"
                  >
                    {c.name}
                  </button>
                  <button
                    className="btnDangerGhost"
                    onClick={() => handleDeleteCategory(c.id)}
                    title="Eliminar categoría"
                  >
                    Eliminar
                  </button>
                </div>
              );
            })}
          </div>

          <div className="hint">
            Tip: solo borra categorías cuando estén vacías.
          </div>
        </section>

        {/* PRODUCTOS */}
        <section className="card adminPanel">
          <div className="panelTitle">
            Productos {selectedCat?.name ? `— ${selectedCat.name}` : ""}
          </div>

          <form className="productForm" onSubmit={handleSubmitProduct}>
            <label className="label">Categoría</label>
            <select
              className="input"
              value={selectedCatId}
              onChange={(e) => setSelectedCatId(e.target.value)}
            >
              <option value="" disabled>Selecciona...</option>
              {categories.map((c) => (
                <option value={c.id} key={c.id}>{c.name}</option>
              ))}
            </select>

            <label className="label">Nombre</label>
            <input
              className="input"
              placeholder="Ej: Pizza Hawaiana"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <label className="label">Precio (COP)</label>
            <input
              className="input"
              placeholder="Ej: 18000"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="numeric"
            />

            <div className="formActions">
              <button className="btnPrimary" type="submit">
                {isEditing ? "Guardar cambios" : "Agregar producto"}
              </button>

              <button
                className="btn"
                type="button"
                onClick={resetProductForm}
              >
                Limpiar
              </button>

              <button
                className="btnDanger"
                type="button"
                onClick={clearAllInCategory}
              >
                Borrar productos de esta categoría
              </button>
            </div>
          </form>

          <div className="list" style={{ marginTop: 12 }}>
            {filteredProducts.length === 0 ? (
              <div className="emptyState">
                No hay productos en esta categoría todavía.
              </div>
            ) : (
              filteredProducts.map((p) => (
                <div className="listItem" key={p.id}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{p.name}</div>
                    <div style={{ opacity: 0.8 }}>${formatCOP(p.price)}</div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={() => startEdit(p)}>
                      Editar
                    </button>
                    <button className="btnDanger" onClick={() => removeProduct(p.id)}>
                      Eliminar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

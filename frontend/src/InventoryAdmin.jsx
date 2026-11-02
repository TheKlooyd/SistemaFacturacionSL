import { useEffect, useMemo, useState } from "react";
import { loadCategories } from "./categoriesStore";
import { addProduct, loadProducts, updateProduct } from "./productsStore";

function formatCOP(value) {
  return new Intl.NumberFormat("es-CO").format(value || 0);
}

function formatQuantity(value) {
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export default function InventoryAdmin({ onBack }) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [selectedCatId, setSelectedCatId] = useState("");
  const [name, setName] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [stockQuantity, setStockQuantity] = useState("0");
  const [editingId, setEditingId] = useState(null);

  const inventoryProducts = useMemo(
    () => products.filter((product) => product.item_type === "product"),
    [products]
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      loadCategories({ throwOnError: true }),
      loadProducts({ throwOnError: true }),
    ]).then(([loadedCategories, loadedProducts]) => {
      if (cancelled) return;
      setCategories(loadedCategories);
      setProducts(loadedProducts);
      setSelectedCatId(loadedCategories[0]?.id || "");
    }).catch((error) => {
      console.error("InventoryAdmin load error:", error);
      if (!cancelled) {
        setLoadError(error?.message || "No se pudo cargar el inventario.");
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function resetForm() {
    setName("");
    setPurchasePrice("");
    setSalePrice("");
    setStockQuantity("0");
    setEditingId(null);
  }

  function startEdit(product) {
    setEditingId(product.id);
    setSelectedCatId(product.category_id || "");
    setName(product.name);
    setPurchasePrice(String(product.purchase_price ?? 0));
    setSalePrice(String(product.price));
    setStockQuantity(String(product.stock_quantity ?? 0));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const cleanName = name.trim();
    const numericPurchasePrice = Number(purchasePrice);
    const numericSalePrice = Number(salePrice);
    const numericStockQuantity = Number(stockQuantity);

    if (!selectedCatId) return alert("Selecciona una categoría existente.");
    if (!cleanName) return alert("Escribe el nombre del producto.");
    if (purchasePrice.trim() === "" || !Number.isFinite(numericPurchasePrice) || numericPurchasePrice < 0) {
      return alert("Escribe un precio de compra válido.");
    }
    if (!Number.isFinite(numericSalePrice) || numericSalePrice <= 0) {
      return alert("Escribe un precio de venta válido, mayor a 0.");
    }
    if (!Number.isFinite(numericStockQuantity) || numericStockQuantity < 0) {
      return alert("Escribe una existencia válida, igual o mayor a 0.");
    }

    const changes = {
      category_id: selectedCatId,
      name: cleanName,
      price: numericSalePrice,
      item_type: "product",
      purchase_price: numericPurchasePrice,
      stock_quantity: numericStockQuantity,
    };

    try {
      const next = editingId
        ? await updateProduct(editingId, changes)
        : await addProduct(changes);
      setProducts(next);
      resetForm();
    } catch (error) {
      console.error("InventoryAdmin save error:", error);
      alert(error?.message || "No se pudo guardar el producto de inventario.");
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>Inventario</h1>
        <div className="topbarActions">
          <button className="btn" onClick={onBack}>Volver</button>
        </div>
      </header>

      {loading ? (
        <p role="status">Cargando inventario...</p>
      ) : loadError ? (
        <p role="alert">{loadError}</p>
      ) : (
        <div className="adminLayout">
          <section className="card adminPanel">
            <div className="panelTitle">
              {editingId ? "Editar producto" : "Agregar producto"}
            </div>
            <form className="productForm" onSubmit={handleSubmit}>
              <label className="label" htmlFor="inventory-name">Nombre</label>
              <input
                id="inventory-name"
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ej: Aceite para moto"
              />

              <label className="label" htmlFor="inventory-category">Categoría de la tienda</label>
              <select
                id="inventory-category"
                className="input"
                value={selectedCatId}
                onChange={(event) => setSelectedCatId(event.target.value)}
              >
                <option value="" disabled>Selecciona...</option>
                {categories.map((category) => (
                  <option value={category.id} key={category.id}>{category.name}</option>
                ))}
              </select>

              <label className="label" htmlFor="inventory-purchase-price">Precio de compra (COP)</label>
              <input
                id="inventory-purchase-price"
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={purchasePrice}
                onChange={(event) => setPurchasePrice(event.target.value)}
              />

              <label className="label" htmlFor="inventory-sale-price">Precio de venta (COP)</label>
              <input
                id="inventory-sale-price"
                className="input"
                type="number"
                min="0.01"
                step="0.01"
                value={salePrice}
                onChange={(event) => setSalePrice(event.target.value)}
              />

              <label className="label" htmlFor="inventory-stock">Existencias actuales</label>
              <input
                id="inventory-stock"
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={stockQuantity}
                onChange={(event) => setStockQuantity(event.target.value)}
              />

              <div className="hint">
                La existencia se descuenta al confirmar el pago de una cuenta.
              </div>

              {categories.length === 0 && (
                <div className="emptyState">
                  Crea una categoría desde Productos antes de registrar inventario.
                </div>
              )}

              <div className="formActions">
                <button className="btnPrimary" type="submit" disabled={!categories.length}>
                  {editingId ? "Guardar cambios" : "Agregar al inventario"}
                </button>
                <button className="btn" type="button" onClick={resetForm}>
                  Limpiar
                </button>
              </div>
            </form>
          </section>

          <section className="card adminPanel">
            <div className="panelTitle">Productos de inventario</div>
            <div className="list" style={{ marginTop: 12 }}>
              {inventoryProducts.length === 0 ? (
                <div className="emptyState">
                  Todavía no hay productos registrados en el inventario.
                </div>
              ) : (
                inventoryProducts.map((product) => (
                  <div className="listItem" key={product.id}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{product.name}</div>
                      <div style={{ opacity: 0.8 }}>
                        {categoriesById.get(product.category_id) || "Sin categoría"}
                      </div>
                      <div style={{ opacity: 0.8 }}>
                        Compra: ${formatCOP(product.purchase_price)} · Venta: ${formatCOP(product.price)}
                      </div>
                      <div style={{ opacity: 0.8 }}>
                        Existencias: {formatQuantity(product.stock_quantity)}
                      </div>
                    </div>
                    <button className="btn" onClick={() => startEdit(product)}>
                      Editar
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import {
  loadClientsFromServer,
  addClient,
  updateClient,
  deleteClient,
} from "./clientsStore";

export default function ClientAdmin({ onBack }) {
  const [clients, setClients] = useState([]);

  // Formulario
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // Búsqueda
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      const loaded = await loadClientsFromServer();
      setClients(loaded);
    })();
  }, []);

  function resetForm() {
    setEditingId(null);
    setName("");
    setPhone("");
    setAddress("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const cleanAddress = address.trim();

    if (!cleanName) return alert("El nombre es obligatorio.");
    if (!cleanPhone) return alert("El teléfono es obligatorio.");
    if (!cleanAddress) return alert("La dirección es obligatoria.");

    if (editingId) {
      const next = await updateClient(editingId, {
        name: cleanName,
        phone: cleanPhone,
        address: cleanAddress,
      });
      setClients(next);
    } else {
      const next = await addClient({
        id: crypto.randomUUID(),
        name: cleanName,
        phone: cleanPhone,
        address: cleanAddress,
        createdAt: new Date().toISOString(),
      });
      setClients(next);
    }
    resetForm();
  }

  function startEdit(c) {
    setEditingId(c.id);
    setName(c.name);
    setPhone(c.phone);
    setAddress(c.address);
  }

  async function handleDelete(id) {
    const c = clients.find((x) => x.id === id);
    if (!confirm(`¿Eliminar al cliente "${c?.name || ""}"?`)) return;
    const next = await deleteClient(id);
    setClients(next);
    if (editingId === id) resetForm();
  }

  const filtered = clients.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      (c.name || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.address || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="page">
      <header className="topbar">
        <h1>Administrador de clientes</h1>
        <div className="topbarActions">
          <button className="btn" onClick={onBack}>Volver</button>
        </div>
      </header>

      <div className="adminLayout">
        {/* FORMULARIO */}
        <section className="card adminPanel">
          <div className="panelTitle">
            {editingId ? "Editar cliente" : "Nuevo cliente"}
          </div>

          <form className="productForm" onSubmit={handleSubmit}>
            <label className="label">Nombre</label>
            <input
              className="input"
              placeholder="Ej: Juan Pérez"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <label className="label">Teléfono</label>
            <input
              className="input"
              placeholder="Ej: 3001234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
            />

            <label className="label">Dirección</label>
            <input
              className="input"
              placeholder="Ej: Calle 10 # 5-20, Barrio Centro"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />

            <div className="formActions">
              <button className="btnPrimary" type="submit">
                {editingId ? "Guardar cambios" : "Registrar cliente"}
              </button>
              {editingId && (
                <button className="btn" type="button" onClick={resetForm}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </section>

        {/* LISTA */}
        <section className="card adminPanel">
          <div className="panelTitle">
            Clientes registrados ({clients.length})
          </div>

          <input
            className="input"
            placeholder="Buscar por nombre, teléfono o dirección..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 12 }}
          />

          <div className="list">
            {filtered.length === 0 ? (
              <div className="emptyState">
                {query ? "No se encontraron clientes." : "No hay clientes registrados todavía."}
              </div>
            ) : (
              filtered.map((c) => (
                <div className="listItem" key={c.id}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{c.name}</div>
                    <div style={{ opacity: 0.8, fontSize: 13 }}>📞 {c.phone}</div>
                    <div style={{ opacity: 0.8, fontSize: 13 }}>📍 {c.address}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={() => startEdit(c)}>
                      Editar
                    </button>
                    <button className="btnDanger" onClick={() => handleDelete(c.id)}>
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

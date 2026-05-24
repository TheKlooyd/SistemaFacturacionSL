const LS_CLIENTS = "pos_clients_v1";

const API_BASE = import.meta.env.DEV
  ? `${location.protocol}//${location.hostname}:3001`
  : "";

// ---------- Load / Save ----------
export function loadClients() {
  try {
    const raw = localStorage.getItem(LS_CLIENTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveClients(clients) {
  localStorage.setItem(LS_CLIENTS, JSON.stringify(clients));
  syncClientsToServer(); // fire-and-forget
}

// ---------- Server sync ----------
export async function syncClientsToServer() {
  try {
    const clients = loadClients();
    await fetch(`${API_BASE}/clients-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clients }),
    });
  } catch {
    // localStorage es la fuente de verdad; fallo de red es silencioso
  }
}

/**
 * Al arrancar, carga clientes desde el servidor (fuente de verdad).
 * Si el servidor falla, usa el localStorage como fallback.
 */
export async function loadClientsFromServer() {
  try {
    const res = await fetch(`${API_BASE}/clients-data`);
    if (!res.ok) return loadClients();
    const data = await res.json();
    if (Array.isArray(data.clients)) {
      localStorage.setItem(LS_CLIENTS, JSON.stringify(data.clients));
      return data.clients;
    }
  } catch {
    // fail silently
  }
  return loadClients();
}

// ---------- CRUD helpers ----------
export function addClient(client) {
  const all = loadClients();
  const next = [client, ...all];
  saveClients(next);
  return next;
}

export function updateClient(id, changes) {
  const all = loadClients();
  const next = all.map((c) => (c.id === id ? { ...c, ...changes } : c));
  saveClients(next);
  return next;
}

export function deleteClient(id) {
  const all = loadClients();
  const next = all.filter((c) => c.id !== id);
  saveClients(next);
  return next;
}

export function findClientById(id) {
  return loadClients().find((c) => c.id === id) || null;
}

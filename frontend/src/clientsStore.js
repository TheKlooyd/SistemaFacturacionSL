import { supabase } from "./supabaseClient";
import { requireNegocioId } from "./tenantSession";

export async function loadClients({ throwOnError = false } = {}) {
  const negocioId = requireNegocioId();

  const { data, error } = await supabase
    .from("clientes")
    .select("id,name,phone,address,notes,created_at")
    .eq("negocio_id", negocioId)
    .order("created_at", { ascending: false });

  if (error) {
    if (throwOnError) throw error;
    console.error("loadClients error:", error);
    return [];
  }

  return (data || []).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    notes: c.notes,
    createdAt: c.created_at,
  }));
}

export async function addClient(client) {
  const negocioId = requireNegocioId();

  const { error } = await supabase.from("clientes").insert({
    id: client.id || crypto.randomUUID(),
    negocio_id: negocioId,
    name: client.name,
    phone: client.phone || null,
    address: client.address || null,
    notes: client.notes || null,
    created_at: client.createdAt || new Date().toISOString(),
  });

  if (error) {
    console.error("addClient error:", error);
  }

  return await loadClients();
}

export async function updateClient(id, changes) {
  const negocioId = requireNegocioId();

  const dbChanges = {};

  if (changes.name !== undefined) dbChanges.name = changes.name;
  if (changes.phone !== undefined) dbChanges.phone = changes.phone;
  if (changes.address !== undefined) dbChanges.address = changes.address;
  if (changes.notes !== undefined) dbChanges.notes = changes.notes;

  const { error } = await supabase
    .from("clientes")
    .update(dbChanges)
    .eq("id", id)
    .eq("negocio_id", negocioId);

  if (error) {
    console.error("updateClient error:", error);
  }

  return await loadClients();
}

export async function deleteClient(id) {
  const negocioId = requireNegocioId();

  const { error } = await supabase
    .from("clientes")
    .delete()
    .eq("id", id)
    .eq("negocio_id", negocioId);

  if (error) {
    console.error("deleteClient error:", error);
  }

  return await loadClients();
}
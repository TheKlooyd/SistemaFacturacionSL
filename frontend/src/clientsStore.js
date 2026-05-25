import { supabase } from "./supabaseClient";

export async function loadClients() {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
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

export async function loadClientsFromServer() {
  return loadClients();
}

export async function addClient(client) {
  const { error } = await supabase.from("clientes").insert({
    id: client.id || crypto.randomUUID(),
    name: client.name,
    phone: client.phone || null,
    address: client.address || null,
    notes: client.notes || null,
    created_at: client.createdAt || new Date().toISOString(),
  });
  if (error) console.error("addClient error:", error);
  return await loadClients();
}

export async function updateClient(id, changes) {
  const dbChanges = {};
  if (changes.name !== undefined) dbChanges.name = changes.name;
  if (changes.phone !== undefined) dbChanges.phone = changes.phone;
  if (changes.address !== undefined) dbChanges.address = changes.address;
  if (changes.notes !== undefined) dbChanges.notes = changes.notes;

  const { error } = await supabase
    .from("clientes")
    .update(dbChanges)
    .eq("id", id);
  if (error) console.error("updateClient error:", error);
  return await loadClients();
}

export async function deleteClient(id) {
  const { error } = await supabase.from("clientes").delete().eq("id", id);
  if (error) console.error("deleteClient error:", error);
  return await loadClients();
}

export async function findClientById(id) {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    phone: data.phone,
    address: data.address,
    notes: data.notes,
    createdAt: data.created_at,
  };
}

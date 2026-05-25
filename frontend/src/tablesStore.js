import { supabase } from "./supabaseClient";

const DEFAULT_TABLES = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  name: `Mesa ${i + 1}`,
  status: "FREE",
}));

export async function loadTables() {
  const { data, error } = await supabase
    .from("mesas")
    .select("*")
    .order("id");

  if (error || !data || data.length === 0) {
    if (error) console.error("loadTables error:", error);
    return DEFAULT_TABLES;
  }
  return data;
}

export async function updateTableStatus(tableId, status) {
  const { error } = await supabase
    .from("mesas")
    .update({ status })
    .eq("id", tableId);
  if (error) console.error("updateTableStatus error:", error);
}

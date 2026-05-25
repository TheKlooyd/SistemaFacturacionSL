import { supabase } from "./supabaseClient";

/** Returns a map { tableId: orderObj } for all open orders */
export async function getAllOpenOrders() {
  const { data, error } = await supabase
    .from("ordenes")
    .select("*")
    .eq("status", "OPEN");

  if (error) {
    console.error("getAllOpenOrders error:", error);
    return {};
  }

  const map = {};
  for (const row of data || []) {
    map[String(row.table_id)] = {
      id: row.id,
      items: row.items || [],
      status: row.status,
      isDelivery: row.is_delivery || false,
      deliveryClient: row.delivery_client || null,
    };
  }
  return map;
}

export async function getOpenOrder(tableId) {
  const { data, error } = await supabase
    .from("ordenes")
    .select("*")
    .eq("table_id", String(tableId))
    .eq("status", "OPEN")
    .maybeSingle();

  if (error) {
    console.error("getOpenOrder error:", error);
    return { items: [], status: "OPEN" };
  }
  if (!data) return { items: [], status: "OPEN" };

  return {
    id: data.id,
    items: data.items || [],
    status: data.status,
    isDelivery: data.is_delivery || false,
    deliveryClient: data.delivery_client || null,
  };
}

export async function setOpenOrder(tableId, order) {
  const { data: existing } = await supabase
    .from("ordenes")
    .select("id")
    .eq("table_id", String(tableId))
    .eq("status", "OPEN")
    .maybeSingle();

  const payload = {
    table_id: String(tableId),
    items: order.items || [],
    status: order.status || "OPEN",
    is_delivery: order.isDelivery || false,
    delivery_client: order.deliveryClient || null,
  };

  if (existing) {
    const { error } = await supabase
      .from("ordenes")
      .update(payload)
      .eq("id", existing.id);
    if (error) console.error("setOpenOrder update error:", error);
  } else {
    const { error } = await supabase
      .from("ordenes")
      .insert({ ...payload, opened_at: new Date().toISOString() });
    if (error) console.error("setOpenOrder insert error:", error);
  }
}

export async function clearOrder(tableId) {
  const { error } = await supabase
    .from("ordenes")
    .delete()
    .eq("table_id", String(tableId))
    .eq("status", "OPEN");
  if (error) console.error("clearOrder error:", error);
}

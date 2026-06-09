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
    const key = String(row.table_id);
    // If duplicate, keep the one with more items
    if (
      !map[key] ||
      (row.items?.length || 0) > (map[key].items?.length || 0)
    ) {
      map[key] = {
        id: row.id,
        items: row.items || [],
        status: row.status,
        isDelivery: row.is_delivery || false,
        deliveryClient: row.delivery_client || null,
      };
    }
  }
  return map;
}

export async function getOpenOrder(tableId) {
  const { data, error } = await supabase
    .from("ordenes")
    .select("*")
    .eq("table_id", String(tableId))
    .eq("status", "OPEN")
    .order("opened_at", { ascending: false });

  if (error) {
    console.error("getOpenOrder error:", error);
    return { items: [], status: "OPEN" };
  }
  if (!data || data.length === 0) return { items: [], status: "OPEN" };

  // If duplicates exist, keep the one with most items; delete the rest
  const sorted = [...data].sort(
    (a, b) => (b.items?.length || 0) - (a.items?.length || 0)
  );
  const best = sorted[0];

  if (sorted.length > 1) {
    const idsToDelete = sorted.slice(1).map((r) => r.id);
    await supabase.from("ordenes").delete().in("id", idsToDelete);
  }

  return {
    id: best.id,
    items: best.items || [],
    status: best.status,
    isDelivery: best.is_delivery || false,
    deliveryClient: best.delivery_client || null,
  };
}

export async function setOpenOrder(tableId, order) {
  const { data: existing, error: fetchError } = await supabase
    .from("ordenes")
    .select("id, items")
    .eq("table_id", String(tableId))
    .eq("status", "OPEN")
    .order("opened_at", { ascending: false });

  const payload = {
    table_id: String(tableId),
    items: order.items || [],
    status: order.status || "OPEN",
    is_delivery: order.isDelivery || false,
    delivery_client: order.deliveryClient || null,
  };

  if (!fetchError && existing && existing.length > 0) {
    // Keep the one with most items, delete the rest
    const sorted = [...existing].sort(
      (a, b) => (b.items?.length || 0) - (a.items?.length || 0)
    );
    const keepId = sorted[0].id;

    if (sorted.length > 1) {
      const idsToDelete = sorted.slice(1).map((r) => r.id);
      await supabase.from("ordenes").delete().in("id", idsToDelete);
    }

    const { error } = await supabase
      .from("ordenes")
      .update(payload)
      .eq("id", keepId);
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

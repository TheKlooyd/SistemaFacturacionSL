import { supabase } from "./supabaseClient";

function mergeConcurrentItems(existingItems = [], incomingItems = []) {
  const merged = existingItems.map((item) => ({ ...item }));

  for (const item of incomingItems) {
    const index = merged.findIndex(
      (current) => current.product_id === item.product_id
        && (current.note || "") === (item.note || "")
    );
    if (index >= 0) {
      merged[index] = {
        ...merged[index],
        qty: Number(merged[index].qty || 0) + Number(item.qty || 0),
      };
    } else {
      merged.push(item);
    }
  }

  return merged;
}

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
        openedAt: row.opened_at || null,
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
    openedAt: best.opened_at || null,
  };
}

export async function setOpenOrder(tableId, order) {
  if (!Array.isArray(order.items) || order.items.length === 0) {
    await clearOrder(tableId);
    return;
  }

  const { data: existing, error: fetchError } = await supabase
    .from("ordenes")
    .select("id, items")
    .eq("table_id", String(tableId))
    .eq("status", "OPEN")
    .order("opened_at", { ascending: false });

  if (fetchError) {
    console.error("setOpenOrder fetch error:", fetchError);
    throw fetchError;
  }

  const payload = {
    table_id: String(tableId),
    items: order.items || [],
    status: order.status || "OPEN",
    is_delivery: order.isDelivery || false,
    delivery_client: order.deliveryClient || null,
    opened_at: order.openedAt || new Date().toISOString(),
  };

  if (existing && existing.length > 0) {
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
    if (error) {
      console.error("setOpenOrder update error:", error);
      throw error;
    }
  } else {
    const { error } = await supabase
      .from("ordenes")
      .insert({ ...payload, opened_at: new Date().toISOString() });

    // El índice único puede detectar que otro dispositivo abrió la mesa entre
    // el SELECT y el INSERT. En ese caso se actualiza la orden que ganó la carrera.
    if (error?.code === "23505") {
      const { data: concurrent, error: concurrentError } = await supabase
        .from("ordenes")
        .select("id,items,opened_at")
        .eq("table_id", String(tableId))
        .eq("status", "OPEN")
        .maybeSingle();

      if (concurrentError || !concurrent) {
        console.error("setOpenOrder concurrent fetch error:", concurrentError || error);
        throw concurrentError || error;
      }

      const { error: updateError } = await supabase
        .from("ordenes")
        .update({
          ...payload,
          items: mergeConcurrentItems(concurrent.items, payload.items),
          opened_at: concurrent.opened_at || payload.opened_at,
        })
        .eq("id", concurrent.id);
      if (updateError) {
        console.error("setOpenOrder concurrent update error:", updateError);
        throw updateError;
      }
    } else if (error) {
      console.error("setOpenOrder insert error:", error);
      throw error;
    }
  }
}

export async function clearOrder(tableId) {
  const { data, error } = await supabase
    .from("ordenes")
    .delete()
    .eq("table_id", String(tableId))
    .eq("status", "OPEN")
    .select("id");
  if (error) {
    console.error("clearOrder error:", error);
    throw error;
  }
  return data || [];
}

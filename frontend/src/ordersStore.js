const KEY = "mini_pos_orders_v1";

export function loadOrders() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveOrders(ordersByTableId) {
  localStorage.setItem(KEY, JSON.stringify(ordersByTableId));
}

export function getOpenOrder(tableId) {
  const all = loadOrders();
  return all[tableId] || { items: [], status: "OPEN" };
}

export function setOpenOrder(tableId, order) {
  const all = loadOrders();
  all[tableId] = order;
  saveOrders(all);
}

export function clearOrder(tableId) {
  const all = loadOrders();
  delete all[tableId];
  saveOrders(all);
}

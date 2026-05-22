// paymentsStore.js
const PAYMENTS_KEY = "miniPOS:payments_v1";
const CLOSE_KEY = "miniPOS:dailyClose_v1";

// ===== Payments (ledger) =====
export function loadPayments() {
  try {
    const raw = localStorage.getItem(PAYMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePayments(payments) {
  localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
}

export function addPayment(payment) {
  const all = loadPayments();
  all.unshift(payment); // más reciente arriba
  savePayments(all);
}

export function clearPayments() {
  localStorage.removeItem(PAYMENTS_KEY);
}

// ===== Daily Close (snapshot) =====
export function saveDailyClose(closeObj) {
  localStorage.setItem(CLOSE_KEY, JSON.stringify(closeObj));
}

export function loadDailyClose() {
  try {
    const raw = localStorage.getItem(CLOSE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function deleteDailyClose() {
  localStorage.removeItem(CLOSE_KEY);
}

const storageKey = (qrToken) => `pos-qr-session:${qrToken}`;
const legacyKey = (qrToken) => `sabor-latino-qr-session:${qrToken}`;

export function loadSessionToken(qrToken, newSecret, storage) {
  try {
    const store = storage || globalThis.localStorage;
    return store.getItem(storageKey(qrToken)) || store.getItem(legacyKey(qrToken)) || newSecret();
  } catch {
    return newSecret();
  }
}

export function saveSessionToken(qrToken, sessionToken, storage) {
  try {
    const store = storage || globalThis.localStorage;
    // Only remove the legacy value after successfully storing the same secret.
    store.setItem(storageKey(qrToken), sessionToken);
    store.removeItem(legacyKey(qrToken));
  } catch {
    // The in-memory session remains usable when storage is blocked or full.
  }
}

export function removeSessionToken(qrToken, storage) {
  for (const key of [storageKey(qrToken), legacyKey(qrToken)]) {
    try { (storage || globalThis.localStorage).removeItem(key); } catch { /* Storage may be blocked. */ }
  }
}

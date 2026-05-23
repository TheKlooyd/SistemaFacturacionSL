const KEY = "pos_tables_v1";

const DEFAULT_TABLES = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  name: `Mesa ${i + 1}`,
  status: "FREE",
}));

export function loadTables() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_TABLES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_TABLES;
  } catch {
    return DEFAULT_TABLES;
  }
}

export function saveTables(tables) {
  localStorage.setItem(KEY, JSON.stringify(tables));
}

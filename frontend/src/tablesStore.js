import { supabase } from "./supabaseClient";

const DEFAULT_TABLE_COUNT = 12;
export const MAX_TABLES = 30;

const DEFAULT_TABLES = Array.from({ length: DEFAULT_TABLE_COUNT }, (_, i) => ({
  id: i + 1,
  name: `Mesa ${i + 1}`,
  status: "FREE",
}));

function normalizeTable(row) {
  return {
    id: Number(row.id),
    name: row.name || `Mesa ${row.id}`,
    status: row.status || "FREE",
  };
}

function getTableNumber(table) {
  const numericId = Number(table.id) || 0;
  const nameMatch = /(\d+)\s*$/.exec(String(table.name || ""));
  const numericName = nameMatch ? Number(nameMatch[1]) : 0;
  return Math.max(numericId, numericName);
}

export function getNextAvailableTableNumber(tables) {
  const usedNumbers = new Set(tables.map(getTableNumber).filter(Boolean));

  for (let number = 1; number <= MAX_TABLES; number += 1) {
    if (!usedNumbers.has(number)) {
      return number;
    }
  }

  return null;
}

async function fetchTables() {
  const { data, error } = await supabase
    .from("mesas")
    .select("*")
    .order("id");

  if (error) {
    console.error("loadTables error:", error);
    return null;
  }

  return (data || []).map(normalizeTable);
}

async function seedDefaultTables() {
  const { error } = await supabase.from("mesas").insert(
    DEFAULT_TABLES.map(({ id, name, status }) => ({ id, name, status }))
  );

  if (error) {
    console.error("seedDefaultTables error:", error);
    return false;
  }

  return true;
}

export async function loadTables() {
  const tables = await fetchTables();

  if (!tables) {
    return DEFAULT_TABLES;
  }

  if (tables.length > 0) {
    return tables;
  }

  const seeded = await seedDefaultTables();
  if (!seeded) {
    return DEFAULT_TABLES;
  }

  const seededTables = await fetchTables();
  return seededTables && seededTables.length > 0 ? seededTables : DEFAULT_TABLES;
}

export async function addTable() {
  const tables = await loadTables();

  if (tables.length >= MAX_TABLES) {
    return tables;
  }

  const nextNumber = getNextAvailableTableNumber(tables);
  if (!nextNumber) {
    return tables;
  }

  const { error } = await supabase.from("mesas").insert({
    id: nextNumber,
    name: `Mesa ${nextNumber}`,
    status: "FREE",
  });

  if (error) {
    console.error("addTable error:", error);
    return tables;
  }

  return await loadTables();
}

export async function deleteTable(tableId) {
  const tables = await loadTables();

  if (tables.length <= 1) {
    return tables;
  }

  const { error } = await supabase
    .from("mesas")
    .delete()
    .eq("id", Number(tableId));

  if (error) {
    console.error("deleteTable error:", error);
    return tables;
  }

  return await loadTables();
}

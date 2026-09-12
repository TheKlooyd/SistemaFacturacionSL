import { supabase } from "./supabaseClient";
import { requireNegocioId } from "./tenantSession";

const DEFAULT_TABLE_COUNT = 12;

export const MAX_TABLES = 12;

function normalizeTable(row) {
  const numero = Number(row.numero ?? row.id);

  return {
    id: Number(row.id),
    numero,
    name: row.name || `Mesa ${numero}`,
    status: row.status || "FREE",
    isActive: row.is_active !== false,
  };
}

function getTableNumber(table) {
  if (Number(table.numero) > 0) {
    return Number(table.numero);
  }

  const nameMatch = /(\d+)\s*$/.exec(
    String(table.name || "")
  );

  return nameMatch ? Number(nameMatch[1]) : 0;
}

export function getNextAvailableTableNumber(tables) {
  const usedNumbers = new Set(
    tables.map(getTableNumber).filter(Boolean)
  );

  for (
    let number = 1;
    number <= MAX_TABLES;
    number += 1
  ) {
    if (!usedNumbers.has(number)) {
      return number;
    }
  }

  return null;
}

async function fetchTables() {
  const negocioId = requireNegocioId();

  const { data, error } = await supabase
    .from("mesas")
    .select("*")
    .eq("negocio_id", negocioId)
    .order("numero");

  if (error) {
    console.error("loadTables error:", error);
    return null;
  }

  return (data || []).map(normalizeTable);
}

async function seedDefaultTables() {
  const negocioId = requireNegocioId();

  const rows = Array.from(
    { length: DEFAULT_TABLE_COUNT },
    (_, index) => {
      const numero = index + 1;

      return {
        negocio_id: negocioId,
        numero,
        name: `Mesa ${numero}`,
        status: "FREE",
        is_active: true,
      };
    }
  );

  const { error } = await supabase
    .from("mesas")
    .insert(rows);

  if (error) {
    console.error("seedDefaultTables error:", error);
    return false;
  }

  return true;
}

export async function loadTables() {
  const tables = await fetchTables();

  if (!tables) {
    return [];
  }

  if (tables.length > 0) {
    return tables;
  }

  const seeded = await seedDefaultTables();

  if (!seeded) {
    return [];
  }

  const seededTables = await fetchTables();

  return seededTables || [];
}

export async function addTable() {
  const negocioId = requireNegocioId();
  const tables = await loadTables();

  if (tables.length >= MAX_TABLES) {
    return tables;
  }

  const nextNumber =
    getNextAvailableTableNumber(tables);

  if (!nextNumber) {
    return tables;
  }

  const { error } = await supabase
    .from("mesas")
    .insert({
      negocio_id: negocioId,
      numero: nextNumber,
      name: `Mesa ${nextNumber}`,
      status: "FREE",
      is_active: true,
    });

  if (error) {
    console.error("addTable error:", error);
    return tables;
  }

  return await loadTables();
}

export async function deleteTable(tableId) {
  const negocioId = requireNegocioId();
  const tables = await loadTables();

  if (tables.length <= 1) {
    return tables;
  }

  const { error } = await supabase
    .from("mesas")
    .delete()
    .eq("id", Number(tableId))
    .eq("negocio_id", negocioId);

  if (error) {
    console.error("deleteTable error:", error);
    return tables;
  }

  return await loadTables();
}
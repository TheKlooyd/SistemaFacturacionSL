-- ============================================================
-- Sabor Latino J&Y — Supabase Schema
-- Ejecuta este SQL en el SQL Editor de tu proyecto Supabase
-- ============================================================

-- Mesas (tables)
CREATE TABLE IF NOT EXISTS mesas (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'FREE'
);

-- Insertar las 12 mesas por defecto (solo si la tabla está vacía)
INSERT INTO mesas (name, status)
SELECT 'Mesa ' || i, 'FREE'
FROM generate_series(1, 12) AS i
WHERE NOT EXISTS (SELECT 1 FROM mesas LIMIT 1);

-- Categorías de productos
CREATE TABLE IF NOT EXISTS categorias (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);

-- Productos
CREATE TABLE IF NOT EXISTS productos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  price       NUMERIC(12, 2) NOT NULL DEFAULT 0
);

-- Clientes (delivery)
CREATE TABLE IF NOT EXISTS clientes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  phone      TEXT,
  address    TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Órdenes abiertas por mesa
CREATE TABLE IF NOT EXISTS ordenes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id        TEXT NOT NULL,
  items           JSONB NOT NULL DEFAULT '[]',
  status          TEXT NOT NULL DEFAULT 'OPEN',
  is_delivery     BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_client JSONB,
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pagos registrados
CREATE TABLE IF NOT EXISTS pagos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id       TEXT,
  table_name     TEXT,
  is_delivery    BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_client JSONB,
  method         TEXT,
  payment_splits JSONB,
  subtotal       NUMERIC(12, 2),
  tip_amount     NUMERIC(12, 2),
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_with_tip NUMERIC(12, 2),
  paid_amount    NUMERIC(12, 2),
  items          JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cierres diarios (snapshots)
CREATE TABLE IF NOT EXISTS cierres_diarios (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_iso   TEXT NOT NULL UNIQUE,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Row Level Security (RLS)
-- Habilitar RLS y permitir acceso con la anon key
-- (ajusta según tus necesidades de seguridad)
-- ============================================================

ALTER TABLE mesas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias       ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cierres_diarios  ENABLE ROW LEVEL SECURITY;

-- Políticas: acceso total para la anon key (uso interno del restaurante)
CREATE POLICY "allow_all_mesas"           ON mesas            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_categorias"      ON categorias       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_productos"       ON productos        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_clientes"        ON clientes         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_ordenes"         ON ordenes          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_pagos"           ON pagos            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_cierres_diarios" ON cierres_diarios  FOR ALL USING (true) WITH CHECK (true);

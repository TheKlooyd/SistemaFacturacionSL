-- ============================================================
-- Sabor Latino J&Y — Supabase Schema
-- Ejecuta este SQL en el SQL Editor de tu proyecto Supabase
-- ============================================================

-- Mesas (tables)
CREATE TABLE IF NOT EXISTS mesas (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'FREE',
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE mesas ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Mesas 1-8 activas; 9-12 reservadas para activarlas en el futuro.
INSERT INTO mesas (id, name, status, is_active)
SELECT i, 'Mesa ' || i, 'FREE', i <= 8
FROM generate_series(1, 12) AS i
ON CONFLICT (id) DO UPDATE SET is_active = EXCLUDED.is_active;

SELECT setval(
  pg_get_serial_sequence('public.mesas', 'id'),
  (SELECT GREATEST(COALESCE(MAX(id), 1), 12) FROM mesas),
  TRUE
);

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
-- El POS requiere una sesión de Supabase Auth. Los clientes QR acceden
-- solamente por la Edge Function qr-order.
-- ============================================================

ALTER TABLE mesas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias       ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cierres_diarios  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'mesas', 'categorias', 'productos', 'clientes',
    'ordenes', 'pagos', 'cierres_diarios'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'allow_all_' || table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'staff_authenticated', table_name);
    EXECUTE format(
      'CREATE POLICY staff_authenticated ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      table_name
    );
  END LOOP;
END
$$;

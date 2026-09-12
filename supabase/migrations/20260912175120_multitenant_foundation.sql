-- Etapa 1: metadatos de negocios. No modifica tablas operativas ni el login.
-- El aislamiento de productos/pagos/QR se implementa en una etapa posterior.
-- No crear cuentas de otros restaurantes hasta completar esa etapa.

create schema sl_private;
revoke all on schema sl_private from public, anon, authenticated;
grant usage on schema sl_private to service_role;

create table public.negocios (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 160),
  estado text not null default 'activo'
    check (estado in ('activo', 'suspendido', 'archivado')),
  created_at timestamptz not null default now()
);

create table public.negocio_usuarios (
  negocio_id uuid not null references public.negocios(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  rol text not null check (rol in ('propietario', 'administrador', 'cajero', 'mesero')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (negocio_id, user_id)
);
-- La PK empieza por negocio_id; este índice cubre la búsqueda por usuario de RLS.
create index negocio_usuarios_user_active_idx
  on public.negocio_usuarios (user_id, negocio_id) where is_active;

create table public.suscripciones (
  negocio_id uuid primary key references public.negocios(id) on delete restrict,
  plan_code text not null default 'manual' check (plan_code ~ '^[a-z0-9_-]+$'),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'activa', 'suspendida', 'cancelada', 'vencida')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or (starts_at is not null and ends_at > starts_at)),
  check (estado <> 'activa' or starts_at is not null)
);

create table public.negocio_configuracion (
  negocio_id uuid primary key references public.negocios(id) on delete restrict,
  nombre_comercial text not null check (char_length(btrim(nombre_comercial)) between 1 and 160),
  logo_url text,
  nit text,
  direccion text,
  telefono text,
  timezone text not null default 'America/Bogota',
  moneda text not null default 'COP' check (moneda ~ '^[A-Z]{3}$'),
  reglas_pedidos text not null default '',
  created_at timestamptz not null default now()
);

-- Solo el backend administrativo puede consultar o modificar esta tabla.
-- No se promueve automáticamente la cuenta existente del restaurante.
create table sl_private.platform_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.negocios enable row level security;
alter table public.negocio_usuarios enable row level security;
alter table public.suscripciones enable row level security;
alter table public.negocio_configuracion enable row level security;
alter table sl_private.platform_admins enable row level security;

-- Quita también los permisos automáticos que pudiera agregar Supabase.
revoke all on public.negocios, public.negocio_usuarios,
  public.suscripciones, public.negocio_configuracion
  from public, anon, authenticated;
revoke all on sl_private.platform_admins from public, anon, authenticated;
grant select on public.negocios, public.negocio_usuarios,
  public.suscripciones, public.negocio_configuracion to authenticated;
grant all on public.negocios, public.negocio_usuarios,
  public.suscripciones, public.negocio_configuracion,
  sl_private.platform_admins to service_role;

create policy membresias_propias on public.negocio_usuarios
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy negocios_del_usuario on public.negocios
  for select to authenticated
  using (id in (
    select negocio_id from public.negocio_usuarios
    where user_id = (select auth.uid()) and is_active
  ));

create policy configuracion_del_negocio on public.negocio_configuracion
  for select to authenticated
  using (negocio_id in (
    select negocio_id from public.negocio_usuarios
    where user_id = (select auth.uid()) and is_active
  ));

create policy suscripcion_para_administradores on public.suscripciones
  for select to authenticated
  using (negocio_id in (
    select negocio_id from public.negocio_usuarios
    where user_id = (select auth.uid()) and is_active
      and rol in ('propietario', 'administrador')
  ));

comment on table public.negocio_usuarios is
  'Membresías administradas desde el backend; el usuario no puede asignarse roles o negocios.';
comment on table public.suscripciones is
  'Estado actual del servicio por negocio. No es la tabla pagos del POS. Solo escritura administrativa.';
comment on table sl_private.platform_admins is
  'Administradores de la plataforma, separados de los usuarios del restaurante. Sin acceso desde el navegador.';

-- Registra la identidad del negocio existente, sin cambiar sus ventas, mesas,
-- usuarios Auth, QR, suscripción o privilegios operativos.
with negocio as (
  insert into public.negocios (slug, nombre)
  values ('sabor-latino', 'Sabor Latino J&Y')
  returning id, nombre
)
insert into public.negocio_configuracion (negocio_id, nombre_comercial)
select id, nombre from negocio;

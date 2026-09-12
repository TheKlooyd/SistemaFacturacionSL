-- Fase 2C: hardening final de aislamiento multi-tenant.

-- 1) Eliminar la unicidad global que impedía cierres del mismo día en negocios distintos.
alter table public.cierres_diarios
  drop constraint if exists cierres_diarios_date_iso_key;

-- 2) Último backfill defensivo antes de volver obligatorio negocio_id.
do $$
declare
  v_negocio_id uuid;
begin
  select id into v_negocio_id
  from public.negocios
  where slug = 'sabor-latino';

  if v_negocio_id is null then
    raise exception 'No existe sabor-latino para completar el backfill final';
  end if;

  update public.categorias set negocio_id = v_negocio_id where negocio_id is null;
  update public.productos set negocio_id = v_negocio_id where negocio_id is null;
  update public.clientes set negocio_id = v_negocio_id where negocio_id is null;
  update public.mesas
    set negocio_id = v_negocio_id,
        numero = coalesce(numero, id)
    where negocio_id is null or numero is null;
  update public.mesa_qr_codes set negocio_id = v_negocio_id where negocio_id is null;
  update public.ordenes set negocio_id = v_negocio_id where negocio_id is null;
  update public.pagos set negocio_id = v_negocio_id where negocio_id is null;
  update public.cierres_diarios set negocio_id = v_negocio_id where negocio_id is null;
  update public.qr_sessions set negocio_id = v_negocio_id where negocio_id is null;
  update public.qr_orders set negocio_id = v_negocio_id where negocio_id is null;
end
$$;

-- 3) negocio_id ya es parte obligatoria de toda fila operativa.
alter table public.categorias alter column negocio_id set not null;
alter table public.productos alter column negocio_id set not null;
alter table public.clientes alter column negocio_id set not null;
alter table public.mesas alter column negocio_id set not null;
alter table public.mesas alter column numero set not null;
alter table public.mesa_qr_codes alter column negocio_id set not null;
alter table public.ordenes alter column negocio_id set not null;
alter table public.pagos alter column negocio_id set not null;
alter table public.cierres_diarios alter column negocio_id set not null;
alter table public.qr_sessions alter column negocio_id set not null;
alter table public.qr_orders alter column negocio_id set not null;

-- 4) Integridad tenant-aware entre productos y categorías.
alter table public.categorias
  add constraint categorias_id_negocio_key unique (id, negocio_id);

alter table public.productos
  drop constraint if exists productos_category_id_fkey;

alter table public.productos
  add constraint productos_category_tenant_fkey
  foreign key (category_id, negocio_id)
  references public.categorias(id, negocio_id)
  on delete set null (category_id);

-- 5) Integridad tenant-aware entre sesiones QR y órdenes.
alter table public.ordenes
  add constraint ordenes_id_negocio_key unique (id, negocio_id);

alter table public.qr_sessions
  drop constraint if exists qr_sessions_order_id_fkey;

alter table public.qr_sessions
  add constraint qr_sessions_order_tenant_fkey
  foreign key (order_id, negocio_id)
  references public.ordenes(id, negocio_id)
  on delete set null (order_id);

-- Índices que cubren FKs compuestas y relaciones frecuentes.
create index if not exists productos_category_tenant_idx
  on public.productos (category_id, negocio_id)
  where category_id is not null;
create index if not exists mesa_qr_codes_mesa_tenant_idx
  on public.mesa_qr_codes (mesa_id, negocio_id);
create index if not exists qr_sessions_qr_tenant_idx
  on public.qr_sessions (qr_code_id, negocio_id);
create index if not exists qr_sessions_order_tenant_idx
  on public.qr_sessions (order_id, negocio_id)
  where order_id is not null;
create index if not exists qr_orders_session_tenant_idx
  on public.qr_orders (session_id, negocio_id);

-- 6) RLS real: ya no se permite acceso global a usuarios autenticados.
drop policy if exists staff_authenticated on public.categorias;
drop policy if exists staff_authenticated on public.productos;
drop policy if exists staff_authenticated on public.clientes;
drop policy if exists staff_authenticated on public.mesas;
drop policy if exists staff_authenticated on public.ordenes;
drop policy if exists staff_authenticated on public.pagos;
drop policy if exists staff_authenticated on public.cierres_diarios;

create policy categorias_del_negocio
on public.categorias
for all
to authenticated
using (
  exists (
    select 1 from public.negocio_usuarios nu
    where nu.user_id = (select auth.uid())
      and nu.negocio_id = categorias.negocio_id
      and nu.is_active = true
  )
)
with check (
  exists (
    select 1 from public.negocio_usuarios nu
    where nu.user_id = (select auth.uid())
      and nu.negocio_id = categorias.negocio_id
      and nu.is_active = true
  )
);

create policy productos_del_negocio
on public.productos
for all
to authenticated
using (
  exists (
    select 1 from public.negocio_usuarios nu
    where nu.user_id = (select auth.uid())
      and nu.negocio_id = productos.negocio_id
      and nu.is_active = true
  )
)
with check (
  exists (
    select 1 from public.negocio_usuarios nu
    where nu.user_id = (select auth.uid())
      and nu.negocio_id = productos.negocio_id
      and nu.is_active = true
  )
);

create policy clientes_del_negocio
on public.clientes
for all
to authenticated
using (
  exists (
    select 1 from public.negocio_usuarios nu
    where nu.user_id = (select auth.uid())
      and nu.negocio_id = clientes.negocio_id
      and nu.is_active = true
  )
)
with check (
  exists (
    select 1 from public.negocio_usuarios nu
    where nu.user_id = (select auth.uid())
      and nu.negocio_id = clientes.negocio_id
      and nu.is_active = true
  )
);

create policy mesas_del_negocio
on public.mesas
for all
to authenticated
using (
  exists (
    select 1 from public.negocio_usuarios nu
    where nu.user_id = (select auth.uid())
      and nu.negocio_id = mesas.negocio_id
      and nu.is_active = true
  )
)
with check (
  exists (
    select 1 from public.negocio_usuarios nu
    where nu.user_id = (select auth.uid())
      and nu.negocio_id = mesas.negocio_id
      and nu.is_active = true
  )
);

create policy ordenes_del_negocio
on public.ordenes
for all
to authenticated
using (
  exists (
    select 1 from public.negocio_usuarios nu
    where nu.user_id = (select auth.uid())
      and nu.negocio_id = ordenes.negocio_id
      and nu.is_active = true
  )
)
with check (
  exists (
    select 1 from public.negocio_usuarios nu
    where nu.user_id = (select auth.uid())
      and nu.negocio_id = ordenes.negocio_id
      and nu.is_active = true
  )
);

create policy pagos_del_negocio
on public.pagos
for all
to authenticated
using (
  exists (
    select 1 from public.negocio_usuarios nu
    where nu.user_id = (select auth.uid())
      and nu.negocio_id = pagos.negocio_id
      and nu.is_active = true
  )
)
with check (
  exists (
    select 1 from public.negocio_usuarios nu
    where nu.user_id = (select auth.uid())
      and nu.negocio_id = pagos.negocio_id
      and nu.is_active = true
  )
);

create policy cierres_del_negocio
on public.cierres_diarios
for all
to authenticated
using (
  exists (
    select 1 from public.negocio_usuarios nu
    where nu.user_id = (select auth.uid())
      and nu.negocio_id = cierres_diarios.negocio_id
      and nu.is_active = true
  )
)
with check (
  exists (
    select 1 from public.negocio_usuarios nu
    where nu.user_id = (select auth.uid())
      and nu.negocio_id = cierres_diarios.negocio_id
      and nu.is_active = true
  )
);

-- 7) Los datos QR siguen siendo server-only; no necesitan políticas para navegador.
-- Se retiran privilegios anónimos heredados de las tablas operativas normales.
revoke all on table public.categorias from anon;
revoke all on table public.productos from anon;
revoke all on table public.clientes from anon;
revoke all on table public.mesas from anon;
revoke all on table public.ordenes from anon;
revoke all on table public.pagos from anon;
revoke all on table public.cierres_diarios from anon;

-- Mantener CRUD explícito al personal autenticado.
grant select, insert, update, delete on table public.categorias to authenticated;
grant select, insert, update, delete on table public.productos to authenticated;
grant select, insert, update, delete on table public.clientes to authenticated;
grant select, insert, update, delete on table public.mesas to authenticated;
grant select, insert, update, delete on table public.ordenes to authenticated;
grant select, insert, update, delete on table public.pagos to authenticated;
grant select, insert, update, delete on table public.cierres_diarios to authenticated;

-- Las tablas QR permanecen exclusivamente del backend/service role.
revoke all on table public.mesa_qr_codes from anon, authenticated;
revoke all on table public.qr_sessions from anon, authenticated;
revoke all on table public.qr_orders from anon, authenticated;
grant all on table public.mesa_qr_codes to service_role;
grant all on table public.qr_sessions to service_role;
grant all on table public.qr_orders to service_role;

-- Fase 2A: preparar las tablas operativas para multi-tenant sin cambiar todavía
-- las policies ni obligar al frontend actual a enviar negocio_id.

alter table public.categorias
  add column negocio_id uuid references public.negocios(id) on delete restrict;

alter table public.productos
  add column negocio_id uuid references public.negocios(id) on delete restrict;

alter table public.clientes
  add column negocio_id uuid references public.negocios(id) on delete restrict;

alter table public.mesas
  add column negocio_id uuid references public.negocios(id) on delete restrict,
  add column numero integer,
  add constraint mesas_numero_positive check (numero is null or numero > 0);

alter table public.mesa_qr_codes
  add column negocio_id uuid references public.negocios(id) on delete restrict;

alter table public.ordenes
  add column negocio_id uuid references public.negocios(id) on delete restrict;

alter table public.pagos
  add column negocio_id uuid references public.negocios(id) on delete restrict;

alter table public.cierres_diarios
  add column negocio_id uuid references public.negocios(id) on delete restrict;

alter table public.qr_sessions
  add column negocio_id uuid references public.negocios(id) on delete restrict;

alter table public.qr_orders
  add column negocio_id uuid references public.negocios(id) on delete restrict;

-- Todo dato previo a la conversión pertenece al único negocio existente:
-- Sabor Latino. Se resuelve por slug; no se fija un UUID generado.
do $$
declare
  v_negocio_id uuid;
begin
  select id into v_negocio_id
  from public.negocios
  where slug = 'sabor-latino';

  if v_negocio_id is null then
    raise exception 'No existe el negocio sabor-latino para realizar el backfill';
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

create index categorias_negocio_idx
  on public.categorias (negocio_id);

create index productos_negocio_idx
  on public.productos (negocio_id);

create index productos_negocio_categoria_idx
  on public.productos (negocio_id, category_id);

create index clientes_negocio_idx
  on public.clientes (negocio_id);

create index mesas_negocio_idx
  on public.mesas (negocio_id);

create index mesas_negocio_numero_idx
  on public.mesas (negocio_id, numero);

create index mesa_qr_codes_negocio_idx
  on public.mesa_qr_codes (negocio_id);

create index mesa_qr_codes_negocio_numero_idx
  on public.mesa_qr_codes (negocio_id, mesa_number);

create index ordenes_negocio_idx
  on public.ordenes (negocio_id);

create index ordenes_negocio_table_idx
  on public.ordenes (negocio_id, table_id);

create index pagos_negocio_idx
  on public.pagos (negocio_id);

create index pagos_negocio_created_idx
  on public.pagos (negocio_id, created_at);

create index cierres_diarios_negocio_idx
  on public.cierres_diarios (negocio_id);

create index cierres_diarios_negocio_fecha_idx
  on public.cierres_diarios (negocio_id, date_iso);

create index qr_sessions_negocio_idx
  on public.qr_sessions (negocio_id);

create index qr_sessions_negocio_qr_idx
  on public.qr_sessions (negocio_id, qr_code_id);

create index qr_orders_negocio_idx
  on public.qr_orders (negocio_id);

create index qr_orders_negocio_session_idx
  on public.qr_orders (negocio_id, session_id);

comment on column public.mesas.numero is
  'Número visible de mesa dentro del negocio. El id sigue siendo el identificador interno global durante la migración.';
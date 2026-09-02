-- Pedidos QR para mesas 1 a 12.
-- Esta migración no contiene los tokens originales de los QR: solamente hashes SHA-256.

alter table public.mesas
  add column if not exists is_active boolean not null default true;

-- La base de producción puede tener solamente las mesas 1 a 8. Se crean las
-- faltantes sin modificar el nombre ni el estado de las que ya existen.
insert into public.mesas (id, name, status, is_active)
select number, 'Mesa ' || number, 'FREE', number <= 8
from generate_series(1, 12) as number
on conflict (id) do update
set is_active = excluded.is_active;

-- Evita que el SERIAL intente reutilizar uno de los identificadores insertados.
select setval(
  pg_get_serial_sequence('public.mesas', 'id'),
  (select greatest(coalesce(max(id), 1), 12) from public.mesas),
  true
);

-- La restricción atómica se crea solamente si no hay duplicados preexistentes.
-- Si existen, la migración se detiene para no borrar cuentas del restaurante.
do $$
begin
  if exists (
    select 1
    from public.ordenes
    where status = 'OPEN'
    group by table_id
    having count(*) > 1
  ) then
    raise exception 'Existen mesas con más de una orden OPEN. Corrígelas antes de aplicar la migración QR.';
  end if;
end
$$;

create unique index if not exists ordenes_one_open_per_table
  on public.ordenes (table_id)
  where status = 'OPEN';

create table if not exists public.mesa_qr_codes (
  id uuid primary key default gen_random_uuid(),
  mesa_id integer not null unique references public.mesas(id) on delete restrict,
  mesa_number integer not null unique check (mesa_number between 1 and 12),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qr_sessions (
  id uuid primary key default gen_random_uuid(),
  qr_code_id uuid not null references public.mesa_qr_codes(id) on delete restrict,
  session_token_hash text not null unique check (session_token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'closed', 'expired')),
  draft_expires_at timestamptz not null,
  preview_count integer not null default 0 check (preview_count between 0 and 20),
  last_preview_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  closed_at timestamptz,
  order_id uuid references public.ordenes(id) on delete set null
);

create unique index if not exists qr_sessions_one_active_per_table
  on public.qr_sessions(qr_code_id)
  where status in ('draft', 'submitted');

create table if not exists public.qr_orders (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.qr_sessions(id) on delete cascade,
  original_text text not null check (char_length(original_text) between 1 and 1500),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  unmatched jsonb not null default '[]'::jsonb check (jsonb_typeof(unmatched) = 'array'),
  total numeric(12,2) not null default 0 check (total >= 0),
  idempotency_key uuid unique,
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);

create or replace function public.qr_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists qr_codes_touch_updated_at on public.mesa_qr_codes;
create trigger qr_codes_touch_updated_at
before update on public.mesa_qr_codes
for each row execute function public.qr_touch_updated_at();

drop trigger if exists qr_sessions_touch_updated_at on public.qr_sessions;
create trigger qr_sessions_touch_updated_at
before update on public.qr_sessions
for each row execute function public.qr_touch_updated_at();

create or replace function public.qr_start_session(
  p_qr_hash text,
  p_session_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  code public.mesa_qr_codes%rowtype;
  active_session public.qr_sessions%rowtype;
  draft public.qr_orders%rowtype;
begin
  if p_qr_hash !~ '^[a-f0-9]{64}$' or p_session_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('state', 'invalid');
  end if;

  select * into code
  from public.mesa_qr_codes
  where token_hash = p_qr_hash
  for update;

  if not found then
    return jsonb_build_object('state', 'invalid');
  end if;

  if not code.is_active
     or not coalesce((select is_active from public.mesas where id = code.mesa_id), false) then
    return jsonb_build_object('state', 'inactive');
  end if;

  update public.qr_sessions
  set status = 'expired'
  where qr_code_id = code.id
    and status = 'draft'
    and draft_expires_at <= now();

  if exists (
    select 1 from public.ordenes
    where table_id = code.mesa_id::text and status = 'OPEN'
  ) then
    return jsonb_build_object('state', 'occupied');
  end if;

  select * into active_session
  from public.qr_sessions
  where qr_code_id = code.id and status in ('draft', 'submitted')
  for update;

  if found then
    if active_session.status = 'draft'
       and active_session.session_token_hash = p_session_hash then
      select * into draft
      from public.qr_orders
      where session_id = active_session.id;

      return jsonb_build_object(
        'state', 'ok',
        'session_id', active_session.id,
        'mesa_number', code.mesa_number,
        'status', 'draft',
        'expires_at', active_session.draft_expires_at,
        'draft_text', draft.original_text,
        'draft_items', coalesce(draft.items, '[]'::jsonb),
        'draft_unmatched', coalesce(draft.unmatched, '[]'::jsonb),
        'draft_total', coalesce(draft.total, 0)
      );
    end if;

    return jsonb_build_object(
      'state',
      case when active_session.status = 'draft' then 'draft_elsewhere' else 'occupied' end
    );
  end if;

  insert into public.qr_sessions(qr_code_id, session_token_hash, draft_expires_at)
  values (code.id, p_session_hash, now() + interval '20 minutes')
  returning * into active_session;

  return jsonb_build_object(
    'state', 'ok',
    'session_id', active_session.id,
    'mesa_number', code.mesa_number,
    'status', 'draft',
    'expires_at', active_session.draft_expires_at,
    'draft_text', null,
    'draft_items', '[]'::jsonb,
    'draft_unmatched', '[]'::jsonb,
    'draft_total', 0
  );
end;
$$;

create or replace function public.qr_session_status(p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  session_row public.qr_sessions%rowtype;
  code public.mesa_qr_codes%rowtype;
  draft public.qr_orders%rowtype;
begin
  select * into session_row
  from public.qr_sessions
  where session_token_hash = p_session_hash
  for update;

  if not found then
    return jsonb_build_object('state', 'invalid');
  end if;

  if session_row.status = 'draft' and session_row.draft_expires_at <= now() then
    update public.qr_sessions set status = 'expired' where id = session_row.id;
    session_row.status := 'expired';
  end if;

  select * into code from public.mesa_qr_codes where id = session_row.qr_code_id;
  select * into draft from public.qr_orders where session_id = session_row.id;

  return jsonb_build_object(
    'state', 'ok',
    'session_id', session_row.id,
    'mesa_number', code.mesa_number,
    'status', session_row.status,
    'expires_at', session_row.draft_expires_at,
    'order_id', session_row.order_id,
    'draft_text', draft.original_text,
    'draft_items', coalesce(draft.items, '[]'::jsonb),
    'draft_unmatched', coalesce(draft.unmatched, '[]'::jsonb),
    'draft_total', coalesce(draft.total, 0)
  );
end;
$$;

-- Reserva atómicamente una llamada a Groq: máximo 20 vistas previas y una
-- petición cada dos segundos por sesión.
create or replace function public.qr_claim_preview(p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  session_row public.qr_sessions%rowtype;
begin
  select * into session_row
  from public.qr_sessions
  where session_token_hash = p_session_hash
  for update;

  if not found then
    return jsonb_build_object('state', 'invalid');
  end if;

  if session_row.status = 'draft' and session_row.draft_expires_at <= now() then
    update public.qr_sessions set status = 'expired' where id = session_row.id;
    return jsonb_build_object('state', 'expired');
  end if;

  if session_row.status <> 'draft' then
    return jsonb_build_object('state', session_row.status);
  end if;

  if session_row.preview_count >= 20 then
    return jsonb_build_object('state', 'preview_limit');
  end if;

  if session_row.last_preview_at is not null
     and session_row.last_preview_at > now() - interval '2 seconds' then
    return jsonb_build_object('state', 'rate_limited');
  end if;

  update public.qr_sessions
  set preview_count = preview_count + 1,
      last_preview_at = now()
  where id = session_row.id;

  return jsonb_build_object(
    'state', 'ok',
    'expires_at', session_row.draft_expires_at
  );
end;
$$;

create or replace function public.qr_save_preview(
  p_session_hash text,
  p_text text,
  p_items jsonb,
  p_unmatched jsonb,
  p_total numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  session_row public.qr_sessions%rowtype;
begin
  if p_text is null
     or char_length(p_text) not between 1 and 1500
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_typeof(p_unmatched) <> 'array'
     or p_total is null
     or p_total < 0 then
    raise exception 'invalid QR preview';
  end if;

  select * into session_row
  from public.qr_sessions
  where session_token_hash = p_session_hash
  for update;

  if not found or session_row.status <> 'draft' or session_row.draft_expires_at <= now() then
    return jsonb_build_object('state', 'expired');
  end if;

  insert into public.qr_orders(session_id, original_text, items, unmatched, total)
  values(session_row.id, p_text, p_items, p_unmatched, p_total)
  on conflict (session_id) do update
  set original_text = excluded.original_text,
      items = excluded.items,
      unmatched = excluded.unmatched,
      total = excluded.total;

  return jsonb_build_object('state', 'ok', 'expires_at', session_row.draft_expires_at);
end;
$$;

create or replace function public.qr_submit_order(
  p_session_hash text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  session_row public.qr_sessions%rowtype;
  code public.mesa_qr_codes%rowtype;
  draft public.qr_orders%rowtype;
  inserted_order public.ordenes%rowtype;
begin
  select * into session_row
  from public.qr_sessions
  where session_token_hash = p_session_hash
  for update;

  if not found then
    return jsonb_build_object('state', 'invalid');
  end if;

  if session_row.status = 'submitted' then
    return jsonb_build_object('state', 'submitted', 'order_id', session_row.order_id);
  end if;

  if session_row.status <> 'draft' or session_row.draft_expires_at <= now() then
    return jsonb_build_object('state', 'expired');
  end if;

  select * into draft
  from public.qr_orders
  where session_id = session_row.id
  for update;

  if not found or jsonb_array_length(draft.items) = 0 then
    return jsonb_build_object('state', 'no_preview');
  end if;

  if draft.idempotency_key is not null and draft.idempotency_key <> p_idempotency_key then
    return jsonb_build_object('state', 'conflict');
  end if;

  select * into code
  from public.mesa_qr_codes
  where id = session_row.qr_code_id
  for update;

  if not code.is_active
     or not coalesce((select is_active from public.mesas where id = code.mesa_id), false) then
    return jsonb_build_object('state', 'inactive');
  end if;

  if exists (
    select 1 from public.ordenes
    where table_id = code.mesa_id::text and status = 'OPEN'
  ) then
    return jsonb_build_object('state', 'occupied');
  end if;

  begin
    insert into public.ordenes(table_id, items, status, is_delivery, delivery_client)
    values(code.mesa_id::text, draft.items, 'OPEN', false, jsonb_build_object('source', 'qr'))
    returning * into inserted_order;
  exception
    when unique_violation then
      return jsonb_build_object('state', 'occupied');
  end;

  update public.qr_orders
  set idempotency_key = p_idempotency_key,
      submitted_at = now()
  where id = draft.id;

  update public.qr_sessions
  set status = 'submitted',
      submitted_at = now(),
      order_id = inserted_order.id
  where id = session_row.id;

  return jsonb_build_object(
    'state', 'submitted',
    'order_id', inserted_order.id,
    'mesa_number', code.mesa_number
  );
end;
$$;

create or replace function public.qr_close_session_when_order_closes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  closed_order_id uuid;
begin
  if tg_op = 'DELETE' then
    closed_order_id := old.id;
  elsif old.status = 'OPEN' and new.status <> 'OPEN' then
    closed_order_id := new.id;
  else
    return new;
  end if;

  update public.qr_sessions
  set status = 'closed', closed_at = now()
  where order_id = closed_order_id and status = 'submitted';

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists qr_close_session_on_order_delete on public.ordenes;
create trigger qr_close_session_on_order_delete
after delete on public.ordenes
for each row execute function public.qr_close_session_when_order_closes();

drop trigger if exists qr_close_session_on_order_status on public.ordenes;
create trigger qr_close_session_on_order_status
after update of status on public.ordenes
for each row execute function public.qr_close_session_when_order_closes();

-- Registra el pago y elimina la orden en una sola transacción. Si cualquiera
-- de las dos operaciones falla, ninguna queda aplicada y el QR no se desincroniza.
create or replace function public.complete_table_payment(p_payment jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  payment_id uuid;
  payment_table_id text;
begin
  if p_payment is null or jsonb_typeof(p_payment) <> 'object' then
    raise exception 'invalid payment payload';
  end if;

  payment_id := nullif(p_payment->>'id', '')::uuid;
  payment_table_id := nullif(p_payment->>'table_id', '');

  if payment_id is null or payment_table_id is null then
    raise exception 'payment id and table id are required';
  end if;

  insert into public.pagos(
    id,
    table_id,
    table_name,
    is_delivery,
    delivery_client,
    method,
    payment_splits,
    subtotal,
    tip_amount,
    discount_amount,
    total_with_tip,
    paid_amount,
    items,
    created_at
  ) values (
    payment_id,
    payment_table_id,
    p_payment->>'table_name',
    coalesce((p_payment->>'is_delivery')::boolean, false),
    nullif(p_payment->'delivery_client', 'null'::jsonb),
    p_payment->>'method',
    nullif(p_payment->'payment_splits', 'null'::jsonb),
    (p_payment->>'subtotal')::numeric,
    (p_payment->>'tip_amount')::numeric,
    coalesce((p_payment->>'discount_amount')::numeric, 0),
    (p_payment->>'total_with_tip')::numeric,
    (p_payment->>'paid_amount')::numeric,
    coalesce(p_payment->'items', '[]'::jsonb),
    coalesce((p_payment->>'created_at')::timestamptz, now())
  );

  delete from public.ordenes
  where table_id = payment_table_id and status = 'OPEN';

  if not found then
    raise exception 'No existe una orden abierta para esta mesa.';
  end if;

  return payment_id;
end;
$$;

-- Activa o desactiva la mesa y su QR en una única operación.
create or replace function public.qr_set_table_active(
  p_mesa_number integer,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_mesa_id integer;
begin
  if p_mesa_number not between 1 and 12 or p_active is null then
    raise exception 'Número o estado de mesa inválido.';
  end if;

  select id into target_mesa_id
  from public.mesas
  where id = p_mesa_number
  for update;

  if not found then
    raise exception 'La mesa no existe.';
  end if;

  if not p_active and (
    exists (
      select 1 from public.ordenes
      where table_id = target_mesa_id::text and status = 'OPEN'
    )
    or exists (
      select 1
      from public.qr_sessions session_row
      join public.mesa_qr_codes code on code.id = session_row.qr_code_id
      where code.mesa_id = target_mesa_id
        and session_row.status in ('draft', 'submitted')
    )
  ) then
    raise exception 'No se puede desactivar una mesa con una sesión o cuenta abierta.';
  end if;

  update public.mesas set is_active = p_active where id = target_mesa_id;
  update public.mesa_qr_codes set is_active = p_active where mesa_id = target_mesa_id;
end;
$$;

alter table public.mesa_qr_codes enable row level security;
alter table public.qr_sessions enable row level security;
alter table public.qr_orders enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'mesas', 'categorias', 'productos', 'clientes',
    'ordenes', 'pagos', 'cierres_diarios'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'allow_all_' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'staff_authenticated', table_name);
    execute format(
      'create policy staff_authenticated on public.%I for all to authenticated using (true) with check (true)',
      table_name
    );
  end loop;
end
$$;

revoke all on public.mesa_qr_codes, public.qr_sessions, public.qr_orders
from anon, authenticated;

revoke all on function public.qr_start_session(text, text) from public, anon, authenticated;
revoke all on function public.qr_session_status(text) from public, anon, authenticated;
revoke all on function public.qr_claim_preview(text) from public, anon, authenticated;
revoke all on function public.qr_save_preview(text, text, jsonb, jsonb, numeric) from public, anon, authenticated;
revoke all on function public.qr_submit_order(text, uuid) from public, anon, authenticated;

grant execute on function public.qr_start_session(text, text) to service_role;
grant execute on function public.qr_session_status(text) to service_role;
grant execute on function public.qr_claim_preview(text) to service_role;
grant execute on function public.qr_save_preview(text, text, jsonb, jsonb, numeric) to service_role;
grant execute on function public.qr_submit_order(text, uuid) to service_role;

revoke all on function public.complete_table_payment(jsonb) from public, anon;
grant execute on function public.complete_table_payment(jsonb) to authenticated, service_role;

revoke all on function public.qr_set_table_active(integer, boolean) from public, anon;
grant execute on function public.qr_set_table_active(integer, boolean) to authenticated, service_role;

-- Postgres Changes solo funciona si la tabla pertenece a la publicación de Realtime.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'ordenes'
     ) then
    execute 'alter publication supabase_realtime add table public.ordenes';
  end if;
end
$$;

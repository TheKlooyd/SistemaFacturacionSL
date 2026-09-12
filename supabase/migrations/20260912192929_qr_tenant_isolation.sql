do $$
begin
  if exists (
    select 1
    from public.mesa_qr_codes q
    join public.mesas m on m.id = q.mesa_id
    where q.negocio_id is distinct from m.negocio_id
       or q.mesa_number is distinct from m.numero
  ) then
    raise exception 'Hay QR existentes que no coinciden con el negocio o número de su mesa.';
  end if;

  if exists (
    select 1
    from public.qr_sessions s
    join public.mesa_qr_codes q on q.id = s.qr_code_id
    where s.negocio_id is distinct from q.negocio_id
  ) then
    raise exception 'Hay sesiones QR asociadas a un negocio distinto al QR.';
  end if;

  if exists (
    select 1
    from public.qr_orders o
    join public.qr_sessions s on s.id = o.session_id
    where o.negocio_id is distinct from s.negocio_id
  ) then
    raise exception 'Hay borradores QR asociados a un negocio distinto a la sesión.';
  end if;
end
$$;

alter table public.mesa_qr_codes
  drop constraint if exists mesa_qr_codes_mesa_number_key;

alter table public.mesa_qr_codes
  add constraint mesa_qr_codes_negocio_mesa_number_key
  unique (negocio_id, mesa_number);

drop index if exists public.ordenes_one_open_per_table;
create unique index ordenes_one_open_per_tenant_table
  on public.ordenes (negocio_id, table_id)
  where status = 'OPEN';

alter table public.mesas
  add constraint mesas_id_negocio_key unique (id, negocio_id);

alter table public.mesa_qr_codes
  add constraint mesa_qr_codes_id_negocio_key unique (id, negocio_id);

alter table public.qr_sessions
  add constraint qr_sessions_id_negocio_key unique (id, negocio_id);

alter table public.mesa_qr_codes
  add constraint mesa_qr_codes_mesa_tenant_fkey
  foreign key (mesa_id, negocio_id)
  references public.mesas(id, negocio_id)
  on delete restrict;

alter table public.qr_sessions
  add constraint qr_sessions_qr_tenant_fkey
  foreign key (qr_code_id, negocio_id)
  references public.mesa_qr_codes(id, negocio_id)
  on delete restrict;

alter table public.qr_orders
  add constraint qr_orders_session_tenant_fkey
  foreign key (session_id, negocio_id)
  references public.qr_sessions(id, negocio_id)
  on delete cascade;

create or replace function public.qr_start_session(
  p_qr_hash text,
  p_session_hash text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  code public.mesa_qr_codes%rowtype;
  active_session public.qr_sessions%rowtype;
  draft public.qr_orders%rowtype;
  mesa_active boolean;
begin
  if p_qr_hash !~ '^[a-f0-9]{64}$' or p_session_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('state', 'invalid');
  end if;

  select * into code
  from public.mesa_qr_codes
  where token_hash = p_qr_hash
  for update;

  if not found or code.negocio_id is null then
    return jsonb_build_object('state', 'invalid');
  end if;

  select m.is_active into mesa_active
  from public.mesas m
  where m.id = code.mesa_id
    and m.negocio_id = code.negocio_id;

  if not code.is_active or not coalesce(mesa_active, false) then
    return jsonb_build_object('state', 'inactive');
  end if;

  update public.qr_sessions
  set status = 'expired'
  where negocio_id = code.negocio_id
    and qr_code_id = code.id
    and status = 'draft'
    and draft_expires_at <= now();

  if exists (
    select 1
    from public.ordenes
    where negocio_id = code.negocio_id
      and table_id = code.mesa_id::text
      and status = 'OPEN'
  ) then
    return jsonb_build_object('state', 'occupied');
  end if;

  select * into active_session
  from public.qr_sessions
  where negocio_id = code.negocio_id
    and qr_code_id = code.id
    and status in ('draft', 'submitted')
  for update;

  if found then
    if active_session.status = 'draft'
       and active_session.session_token_hash = p_session_hash then
      select * into draft
      from public.qr_orders
      where negocio_id = code.negocio_id
        and session_id = active_session.id;

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

  if exists (
    select 1
    from public.qr_sessions
    where session_token_hash = p_session_hash
  ) then
    return jsonb_build_object('state', 'stale_session');
  end if;

  insert into public.qr_sessions(
    negocio_id,
    qr_code_id,
    session_token_hash,
    draft_expires_at
  )
  values (
    code.negocio_id,
    code.id,
    p_session_hash,
    now() + interval '5 minutes'
  )
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
$function$;

create or replace function public.qr_claim_preview(p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  session_row public.qr_sessions%rowtype;
  processing_expires_at timestamptz;
begin
  select * into session_row
  from public.qr_sessions
  where session_token_hash = p_session_hash
  for update;

  if not found or session_row.negocio_id is null then
    return jsonb_build_object('state', 'invalid');
  end if;

  if session_row.status = 'draft' and session_row.draft_expires_at <= now() then
    update public.qr_sessions
    set status = 'expired'
    where id = session_row.id
      and negocio_id = session_row.negocio_id;

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

  processing_expires_at := greatest(
    session_row.draft_expires_at,
    now() + interval '2 minutes'
  );

  update public.qr_sessions
  set preview_count = preview_count + 1,
      last_preview_at = now(),
      draft_expires_at = processing_expires_at
  where id = session_row.id
    and negocio_id = session_row.negocio_id;

  return jsonb_build_object(
    'state', 'ok',
    'negocio_id', session_row.negocio_id,
    'expires_at', processing_expires_at
  );
end;
$function$;

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
set search_path to 'public', 'pg_temp'
as $function$
declare
  session_row public.qr_sessions%rowtype;
  extended_expires_at timestamptz;
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

  if not found
     or session_row.negocio_id is null
     or session_row.status <> 'draft'
     or session_row.draft_expires_at <= now() then
    return jsonb_build_object('state', 'expired');
  end if;

  extended_expires_at := now() + interval '5 minutes';

  insert into public.qr_orders(
    negocio_id,
    session_id,
    original_text,
    items,
    unmatched,
    total
  )
  values(
    session_row.negocio_id,
    session_row.id,
    p_text,
    p_items,
    p_unmatched,
    p_total
  )
  on conflict (session_id) do update
  set negocio_id = excluded.negocio_id,
      original_text = excluded.original_text,
      items = excluded.items,
      unmatched = excluded.unmatched,
      total = excluded.total;

  update public.qr_sessions
  set draft_expires_at = extended_expires_at
  where id = session_row.id
    and negocio_id = session_row.negocio_id;

  return jsonb_build_object('state', 'ok', 'expires_at', extended_expires_at);
end;
$function$;

create or replace function public.qr_session_status(p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  session_row public.qr_sessions%rowtype;
  code public.mesa_qr_codes%rowtype;
  draft public.qr_orders%rowtype;
begin
  select * into session_row
  from public.qr_sessions
  where session_token_hash = p_session_hash
  for update;

  if not found or session_row.negocio_id is null then
    return jsonb_build_object('state', 'invalid');
  end if;

  if session_row.status = 'draft' and session_row.draft_expires_at <= now() then
    update public.qr_sessions
    set status = 'expired'
    where id = session_row.id
      and negocio_id = session_row.negocio_id;

    session_row.status := 'expired';
  end if;

  select * into code
  from public.mesa_qr_codes
  where id = session_row.qr_code_id
    and negocio_id = session_row.negocio_id;

  select * into draft
  from public.qr_orders
  where session_id = session_row.id
    and negocio_id = session_row.negocio_id;

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
$function$;

create or replace function public.qr_submit_order(
  p_session_hash text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  session_row public.qr_sessions%rowtype;
  code public.mesa_qr_codes%rowtype;
  draft public.qr_orders%rowtype;
  inserted_order public.ordenes%rowtype;
  mesa_active boolean;
begin
  select * into session_row
  from public.qr_sessions
  where session_token_hash = p_session_hash
  for update;

  if not found or session_row.negocio_id is null then
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
    and negocio_id = session_row.negocio_id
  for update;

  if not found or jsonb_array_length(draft.items) = 0 then
    return jsonb_build_object('state', 'no_preview');
  end if;

  if draft.idempotency_key is not null and draft.idempotency_key <> p_idempotency_key then
    return jsonb_build_object('state', 'conflict');
  end if;

  if exists (
    select 1
    from jsonb_array_elements(draft.items) as item
    where coalesce(item->>'product_id', '') = ''
       or not exists (
         select 1
         from public.productos p
         where p.negocio_id = session_row.negocio_id
           and p.id::text = item->>'product_id'
       )
  ) then
    return jsonb_build_object('state', 'invalid_products');
  end if;

  select * into code
  from public.mesa_qr_codes
  where id = session_row.qr_code_id
    and negocio_id = session_row.negocio_id
  for update;

  if not found then
    return jsonb_build_object('state', 'invalid');
  end if;

  select m.is_active into mesa_active
  from public.mesas m
  where m.id = code.mesa_id
    and m.negocio_id = session_row.negocio_id;

  if not code.is_active or not coalesce(mesa_active, false) then
    return jsonb_build_object('state', 'inactive');
  end if;

  if exists (
    select 1
    from public.ordenes
    where negocio_id = session_row.negocio_id
      and table_id = code.mesa_id::text
      and status = 'OPEN'
  ) then
    return jsonb_build_object('state', 'occupied');
  end if;

  begin
    insert into public.ordenes(
      negocio_id,
      table_id,
      items,
      status,
      is_delivery,
      delivery_client
    )
    values(
      session_row.negocio_id,
      code.mesa_id::text,
      draft.items,
      'OPEN',
      false,
      jsonb_build_object('source', 'qr')
    )
    returning * into inserted_order;
  exception
    when unique_violation then
      return jsonb_build_object('state', 'occupied');
  end;

  update public.qr_orders
  set idempotency_key = p_idempotency_key,
      submitted_at = now()
  where id = draft.id
    and negocio_id = session_row.negocio_id;

  update public.qr_sessions
  set status = 'submitted',
      submitted_at = now(),
      order_id = inserted_order.id
  where id = session_row.id
    and negocio_id = session_row.negocio_id;

  return jsonb_build_object(
    'state', 'submitted',
    'order_id', inserted_order.id,
    'mesa_number', code.mesa_number
  );
end;
$function$;

create or replace function public.qr_close_session_when_order_closes()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  closed_order_id uuid;
  closed_negocio_id uuid;
begin
  if tg_op = 'DELETE' then
    closed_order_id := old.id;
    closed_negocio_id := old.negocio_id;
  elsif old.status = 'OPEN' and new.status <> 'OPEN' then
    closed_order_id := new.id;
    closed_negocio_id := new.negocio_id;
  else
    return new;
  end if;

  update public.qr_sessions
  set status = 'closed', closed_at = now()
  where order_id = closed_order_id
    and negocio_id = closed_negocio_id
    and status = 'submitted';

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;

create or replace function public.qr_set_table_active(
  p_mesa_number integer,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  target_mesa_id integer;
  v_negocio_id uuid;
  membership_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para modificar una mesa.';
  end if;

  if p_mesa_number not between 1 and 12 or p_active is null then
    raise exception 'Número o estado de mesa inválido.';
  end if;

  select count(*), min(negocio_id)
  into membership_count, v_negocio_id
  from public.negocio_usuarios
  where user_id = (select auth.uid())
    and is_active = true
    and rol in ('propietario', 'administrador');

  if membership_count <> 1 or v_negocio_id is null then
    raise exception 'No se pudo determinar un único negocio administrable para esta cuenta.';
  end if;

  select id into target_mesa_id
  from public.mesas
  where negocio_id = v_negocio_id
    and numero = p_mesa_number
  for update;

  if not found then
    raise exception 'La mesa no existe en este negocio.';
  end if;

  if not p_active and (
    exists (
      select 1
      from public.ordenes
      where negocio_id = v_negocio_id
        and table_id = target_mesa_id::text
        and status = 'OPEN'
    )
    or exists (
      select 1
      from public.qr_sessions session_row
      join public.mesa_qr_codes code
        on code.id = session_row.qr_code_id
       and code.negocio_id = session_row.negocio_id
      where session_row.negocio_id = v_negocio_id
        and code.mesa_id = target_mesa_id
        and session_row.status in ('draft', 'submitted')
    )
  ) then
    raise exception 'No se puede desactivar una mesa con una sesión o cuenta abierta.';
  end if;

  update public.mesas
  set is_active = p_active
  where id = target_mesa_id
    and negocio_id = v_negocio_id;

  update public.mesa_qr_codes
  set is_active = p_active
  where mesa_id = target_mesa_id
    and negocio_id = v_negocio_id;
end;
$function$;

revoke all on function public.qr_close_session_when_order_closes() from public, anon, authenticated;
revoke all on function public.qr_touch_updated_at() from public, anon, authenticated;
grant execute on function public.qr_close_session_when_order_closes() to service_role;
grant execute on function public.qr_touch_updated_at() to service_role;

revoke all on function public.qr_set_table_active(integer, boolean) from public, anon;
grant execute on function public.qr_set_table_active(integer, boolean) to authenticated, service_role;

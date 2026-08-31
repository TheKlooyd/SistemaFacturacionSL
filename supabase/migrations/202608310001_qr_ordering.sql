-- QR ordering: execute through Supabase migrations. Tokens are SHA-256 hashes only.
alter table public.mesas add column if not exists is_active boolean not null default true;
update public.mesas set is_active = case when id between 1 and 8 then true else false end where id between 1 and 12;

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
  status text not null check (status in ('draft', 'submitted', 'closed', 'expired')) default 'draft',
  draft_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  closed_at timestamptz,
  order_id uuid references public.ordenes(id) on delete set null
);

create unique index if not exists qr_sessions_one_active_per_table
  on public.qr_sessions(qr_code_id) where status in ('draft', 'submitted');

create table if not exists public.qr_orders (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.qr_sessions(id) on delete cascade,
  original_text text not null check (char_length(original_text) between 1 and 1500),
  items jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null default 0 check (total >= 0),
  idempotency_key uuid unique,
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);

create or replace function public.qr_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists qr_codes_touch_updated_at on public.mesa_qr_codes;
create trigger qr_codes_touch_updated_at before update on public.mesa_qr_codes for each row execute function public.qr_touch_updated_at();
drop trigger if exists qr_sessions_touch_updated_at on public.qr_sessions;
create trigger qr_sessions_touch_updated_at before update on public.qr_sessions for each row execute function public.qr_touch_updated_at();

create or replace function public.qr_start_session(p_qr_hash text, p_session_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare code mesa_qr_codes%rowtype; active_session qr_sessions%rowtype;
begin
  if p_qr_hash !~ '^[a-f0-9]{64}$' or p_session_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('state', 'invalid');
  end if;
  select * into code from mesa_qr_codes where token_hash = p_qr_hash for update;
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  if not code.is_active or not (select is_active from mesas where id = code.mesa_id) then
    return jsonb_build_object('state', 'inactive');
  end if;
  update qr_sessions set status = 'expired' where qr_code_id = code.id and status = 'draft' and draft_expires_at <= now();
  if exists (select 1 from ordenes where table_id = code.mesa_id::text and status = 'OPEN') then
    return jsonb_build_object('state', 'occupied');
  end if;
  select * into active_session from qr_sessions where qr_code_id = code.id and status in ('draft', 'submitted') for update;
  if found then
    if active_session.status = 'draft' and active_session.session_token_hash = p_session_hash then
      return jsonb_build_object('state', 'ok', 'session_id', active_session.id, 'mesa_number', code.mesa_number, 'status', 'draft', 'expires_at', active_session.draft_expires_at);
    end if;
    return jsonb_build_object('state', case when active_session.status = 'draft' then 'draft_elsewhere' else 'occupied' end);
  end if;
  insert into qr_sessions(qr_code_id, session_token_hash, draft_expires_at)
  values (code.id, p_session_hash, now() + interval '20 minutes') returning * into active_session;
  return jsonb_build_object('state', 'ok', 'session_id', active_session.id, 'mesa_number', code.mesa_number, 'status', 'draft', 'expires_at', active_session.draft_expires_at);
end;
$$;

create or replace function public.qr_session_status(p_session_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s qr_sessions%rowtype; code mesa_qr_codes%rowtype;
begin
  select * into s from qr_sessions where session_token_hash = p_session_hash for update;
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  if s.status = 'draft' and s.draft_expires_at <= now() then update qr_sessions set status = 'expired' where id = s.id; s.status := 'expired'; end if;
  select * into code from mesa_qr_codes where id = s.qr_code_id;
  return jsonb_build_object('state', 'ok', 'session_id', s.id, 'mesa_number', code.mesa_number, 'status', s.status, 'expires_at', s.draft_expires_at, 'order_id', s.order_id);
end;
$$;

create or replace function public.qr_save_preview(p_session_hash text, p_text text, p_items jsonb, p_total numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s qr_sessions%rowtype;
begin
  if char_length(p_text) not between 1 and 1500 or jsonb_typeof(p_items) <> 'array' or p_total < 0 then raise exception 'invalid QR preview'; end if;
  select * into s from qr_sessions where session_token_hash = p_session_hash for update;
  if not found or s.status <> 'draft' or s.draft_expires_at <= now() then return jsonb_build_object('state', 'expired'); end if;
  insert into qr_orders(session_id, original_text, items, total) values(s.id, p_text, p_items, p_total)
  on conflict (session_id) do update set original_text = excluded.original_text, items = excluded.items, total = excluded.total;
  return jsonb_build_object('state', 'ok', 'expires_at', s.draft_expires_at);
end;
$$;

create or replace function public.qr_submit_order(p_session_hash text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s qr_sessions%rowtype; code mesa_qr_codes%rowtype; draft qr_orders%rowtype; inserted_order ordenes%rowtype;
begin
  select * into s from qr_sessions where session_token_hash = p_session_hash for update;
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  if s.status = 'submitted' then return jsonb_build_object('state', 'submitted', 'order_id', s.order_id); end if;
  if s.status <> 'draft' or s.draft_expires_at <= now() then return jsonb_build_object('state', 'expired'); end if;
  select * into draft from qr_orders where session_id = s.id for update;
  if not found or jsonb_array_length(draft.items) = 0 then return jsonb_build_object('state', 'no_preview'); end if;
  if draft.idempotency_key is not null and draft.idempotency_key <> p_idempotency_key then return jsonb_build_object('state', 'conflict'); end if;
  select * into code from mesa_qr_codes where id = s.qr_code_id;
  if exists (select 1 from ordenes where table_id = code.mesa_id::text and status = 'OPEN') then return jsonb_build_object('state', 'occupied'); end if;
  update qr_orders set idempotency_key = p_idempotency_key, submitted_at = now() where id = draft.id;
  insert into ordenes(table_id, items, status, is_delivery, delivery_client)
  values(code.mesa_id::text, draft.items, 'OPEN', false, jsonb_build_object('source', 'qr')) returning * into inserted_order;
  update qr_sessions set status = 'submitted', submitted_at = now(), order_id = inserted_order.id where id = s.id;
  return jsonb_build_object('state', 'submitted', 'order_id', inserted_order.id, 'mesa_number', code.mesa_number);
end;
$$;

create or replace function public.qr_close_session_when_order_closes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update qr_sessions set status = 'closed', closed_at = now() where order_id = old.id and status = 'submitted';
  return old;
end;
$$;
drop trigger if exists qr_close_session_on_order_delete on public.ordenes;
create trigger qr_close_session_on_order_delete after delete on public.ordenes for each row execute function public.qr_close_session_when_order_closes();

alter table public.mesa_qr_codes enable row level security;
alter table public.qr_sessions enable row level security;
alter table public.qr_orders enable row level security;
do $$ declare t text; begin
  foreach t in array array['mesas','categorias','productos','clientes','ordenes','pagos','cierres_diarios'] loop
    execute format('drop policy if exists %I on public.%I', 'allow_all_' || t, t);
    execute format('create policy staff_authenticated on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
revoke all on public.mesa_qr_codes, public.qr_sessions, public.qr_orders from anon, authenticated;
revoke all on function public.qr_start_session(text, text), public.qr_session_status(text), public.qr_save_preview(text, text, jsonb, numeric), public.qr_submit_order(text, uuid) from public, anon, authenticated;
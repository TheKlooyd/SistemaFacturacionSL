-- Corrige el ciclo de vida de los pedidos QR.
-- 1. Cierra la sesion QR antes de eliminar su orden.
-- 2. Los borradores vencen tras cinco minutos sin actividad.
-- 3. Escribir o generar una vista previa renueva esos cinco minutos.
-- 4. Detecta tokens locales pertenecientes a sesiones ya terminadas.

-- El FK qr_sessions.order_id usa ON DELETE SET NULL. El trigger debe ejecutarse
-- BEFORE DELETE para conservar order_id el tiempo suficiente para cerrar la sesion.
drop trigger if exists qr_close_session_on_order_delete on public.ordenes;
create trigger qr_close_session_on_order_delete
before delete on public.ordenes
for each row execute function public.qr_close_session_when_order_closes();

-- Una orden OPEN sin productos no representa una cuenta util y produce una
-- diferencia entre la pantalla de mesas y la validacion del QR.
delete from public.ordenes
where status = 'OPEN'
  and jsonb_typeof(items) = 'array'
  and jsonb_array_length(items) = 0;

-- Repara sesiones submitted que quedaron bloqueadas por eliminaciones anteriores,
-- pero solamente cuando la mesa ya no tiene ninguna orden OPEN.
update public.qr_sessions as session_row
set status = 'closed',
    closed_at = coalesce(session_row.closed_at, now())
from public.mesa_qr_codes as code
where session_row.qr_code_id = code.id
  and session_row.status = 'submitted'
  and not exists (
    select 1
    from public.ordenes as open_order
    where open_order.table_id = code.mesa_id::text
      and open_order.status = 'OPEN'
  );

-- Convierte tambien los borradores actuales al nuevo limite de inactividad.
update public.qr_sessions as session_row
set draft_expires_at = least(
  session_row.draft_expires_at,
  greatest(
    session_row.created_at,
    coalesce(session_row.last_preview_at, session_row.created_at)
  ) + interval '5 minutes'
)
where session_row.status = 'draft';

update public.qr_sessions
set status = 'expired'
where status = 'draft'
  and draft_expires_at <= now();

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

  -- La expiracion es diferida: se materializa al recibir la siguiente solicitud.
  update public.qr_sessions
  set status = 'expired'
  where qr_code_id = code.id
    and status = 'draft'
    and draft_expires_at <= now();

  if exists (
    select 1
    from public.ordenes
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

  -- localStorage puede conservar el token de una sesion closed/expired. Como la
  -- columna es UNIQUE, se avisa al frontend para que genere otro antes del INSERT.
  if exists (
    select 1
    from public.qr_sessions
    where session_token_hash = p_session_hash
  ) then
    return jsonb_build_object('state', 'stale_session');
  end if;

  insert into public.qr_sessions(qr_code_id, session_token_hash, draft_expires_at)
  values (code.id, p_session_hash, now() + interval '5 minutes')
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

-- Renueva una sesion mientras el cliente esta escribiendo. Esta llamada no usa
-- Groq ni aumenta preview_count.
create or replace function public.qr_touch_session(p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  session_row public.qr_sessions%rowtype;
  extended_expires_at timestamptz;
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

  extended_expires_at := now() + interval '5 minutes';

  update public.qr_sessions
  set draft_expires_at = extended_expires_at
  where id = session_row.id;

  return jsonb_build_object('state', 'ok', 'expires_at', extended_expires_at);
end;
$$;

create or replace function public.qr_claim_preview(p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  session_row public.qr_sessions%rowtype;
  processing_expires_at timestamptz;
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

  -- Evita que la sesion venza mientras Groq esta procesando una solicitud que
  -- comenzo a tiempo. Al guardarse la vista previa recibira cinco minutos.
  processing_expires_at := greatest(
    session_row.draft_expires_at,
    now() + interval '2 minutes'
  );

  update public.qr_sessions
  set preview_count = preview_count + 1,
      last_preview_at = now(),
      draft_expires_at = processing_expires_at
  where id = session_row.id;

  return jsonb_build_object(
    'state', 'ok',
    'expires_at', processing_expires_at
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

  if not found or session_row.status <> 'draft' or session_row.draft_expires_at <= now() then
    return jsonb_build_object('state', 'expired');
  end if;

  extended_expires_at := now() + interval '5 minutes';

  insert into public.qr_orders(session_id, original_text, items, unmatched, total)
  values(session_row.id, p_text, p_items, p_unmatched, p_total)
  on conflict (session_id) do update
  set original_text = excluded.original_text,
      items = excluded.items,
      unmatched = excluded.unmatched,
      total = excluded.total;

  update public.qr_sessions
  set draft_expires_at = extended_expires_at
  where id = session_row.id;

  return jsonb_build_object('state', 'ok', 'expires_at', extended_expires_at);
end;
$$;

revoke all on function public.qr_start_session(text, text) from public, anon, authenticated;
revoke all on function public.qr_touch_session(text) from public, anon, authenticated;
revoke all on function public.qr_claim_preview(text) from public, anon, authenticated;
revoke all on function public.qr_save_preview(text, text, jsonb, jsonb, numeric)
from public, anon, authenticated;

grant execute on function public.qr_start_session(text, text) to service_role;
grant execute on function public.qr_touch_session(text) to service_role;
grant execute on function public.qr_claim_preview(text) to service_role;
grant execute on function public.qr_save_preview(text, text, jsonb, jsonb, numeric) to service_role;

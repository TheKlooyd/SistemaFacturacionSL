create or replace function public.complete_table_payment(p_payment jsonb)
returns uuid
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  payment_id uuid;
  payment_table_id text;
  v_negocio_id uuid;
  v_negocios uuid[];
begin
  if p_payment is null or jsonb_typeof(p_payment) <> 'object' then
    raise exception 'invalid payment payload';
  end if;

  payment_id := nullif(p_payment->>'id', '')::uuid;
  payment_table_id := nullif(p_payment->>'table_id', '');
  v_negocio_id := nullif(p_payment->>'negocio_id', '')::uuid;

  if payment_id is null or payment_table_id is null then
    raise exception 'payment id and table id are required';
  end if;

  if v_negocio_id is null and (select auth.uid()) is not null then
    select array_agg(negocio_id order by created_at)
      into v_negocios
    from public.negocio_usuarios
    where user_id = (select auth.uid())
      and is_active = true;

    if v_negocios is null or cardinality(v_negocios) <> 1 then
      raise exception 'No se pudo determinar un único negocio para el pago.';
    end if;

    v_negocio_id := v_negocios[1];
  end if;

  if v_negocio_id is null then
    raise exception 'negocio_id is required';
  end if;

  if (select auth.uid()) is not null and not exists (
    select 1
    from public.negocio_usuarios
    where user_id = (select auth.uid())
      and negocio_id = v_negocio_id
      and is_active = true
  ) then
    raise exception 'El usuario no pertenece al negocio indicado.';
  end if;

  if not exists (
    select 1
    from public.ordenes
    where negocio_id = v_negocio_id
      and table_id = payment_table_id
      and status = 'OPEN'
  ) then
    raise exception 'No existe una orden abierta para esta mesa en el negocio indicado.';
  end if;

  insert into public.pagos(
    id,
    negocio_id,
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
    v_negocio_id,
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
  where negocio_id = v_negocio_id
    and table_id = payment_table_id
    and status = 'OPEN';

  if not found then
    raise exception 'No existe una orden abierta para esta mesa.';
  end if;

  return payment_id;
end;
$function$;

create or replace function public.qr_set_table_active(p_mesa_number integer, p_active boolean)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  target_mesa_id integer;
  v_negocio_id uuid;
  v_negocios uuid[];
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para modificar una mesa.';
  end if;

  if p_mesa_number not between 1 and 12 or p_active is null then
    raise exception 'Número o estado de mesa inválido.';
  end if;

  select array_agg(negocio_id order by created_at)
    into v_negocios
  from public.negocio_usuarios
  where user_id = (select auth.uid())
    and is_active = true
    and rol in ('propietario', 'administrador');

  if v_negocios is null or cardinality(v_negocios) <> 1 then
    raise exception 'No se pudo determinar un único negocio administrable para esta cuenta.';
  end if;

  v_negocio_id := v_negocios[1];

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

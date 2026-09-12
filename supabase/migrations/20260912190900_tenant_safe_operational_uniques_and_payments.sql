alter table public.mesas
  add constraint mesas_negocio_numero_key
  unique (negocio_id, numero);

alter table public.cierres_diarios
  add constraint cierres_diarios_negocio_date_iso_key
  unique (negocio_id, date_iso);

create or replace function public.complete_table_payment(p_payment jsonb)
returns uuid
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  payment_id uuid;
  payment_table_id text;
  v_negocio_id uuid;
  membership_count integer;
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
    select count(*), min(negocio_id)
      into membership_count, v_negocio_id
    from public.negocio_usuarios
    where user_id = (select auth.uid())
      and is_active = true;

    if membership_count <> 1 then
      raise exception 'No se pudo determinar un único negocio para el pago.';
    end if;
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
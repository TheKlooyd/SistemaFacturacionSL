-- Inventory prices and stock are updated with the successful payment.
alter table public.productos
  add column if not exists purchase_price numeric(12, 2) not null default 0
    check (purchase_price >= 0),
  add column if not exists stock_quantity numeric(12, 2) not null default 0
    check (stock_quantity >= 0);

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
  v_payment_items jsonb;
  v_inventory_item record;
begin
  if p_payment is null or jsonb_typeof(p_payment) <> 'object' then
    raise exception 'invalid payment payload';
  end if;

  payment_id := nullif(p_payment->>'id', '')::uuid;
  payment_table_id := nullif(p_payment->>'table_id', '');
  v_negocio_id := nullif(p_payment->>'negocio_id', '')::uuid;
  v_payment_items := coalesce(
    nullif(p_payment->'items', 'null'::jsonb),
    '[]'::jsonb
  );

  if payment_id is null or payment_table_id is null then
    raise exception 'payment id and table id are required';
  end if;

  if jsonb_typeof(v_payment_items) <> 'array' then
    raise exception 'payment items must be an array';
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

  perform p.id
  from public.productos p
  where p.negocio_id = v_negocio_id
    and p.item_type = 'product'
    and p.id in (
      select nullif(line.item->>'product_id', '')::uuid
      from jsonb_array_elements(v_payment_items) as line(item)
      where nullif(line.item->>'product_id', '') is not null
    )
  order by p.id
  for update;

  for v_inventory_item in
    select
      p.id,
      p.name,
      p.stock_quantity,
      sum(nullif(line.item->>'qty', '')::numeric) as requested_quantity
    from jsonb_array_elements(v_payment_items) as line(item)
    join public.productos p
      on p.id = nullif(line.item->>'product_id', '')::uuid
     and p.negocio_id = v_negocio_id
     and p.item_type = 'product'
    group by p.id, p.name, p.stock_quantity
    order by p.id
  loop
    if v_inventory_item.requested_quantity is null
      or v_inventory_item.requested_quantity <= 0 then
      raise exception 'La cantidad de un producto de inventario no es válida.';
    end if;

    if v_inventory_item.stock_quantity < v_inventory_item.requested_quantity then
      raise exception using
        errcode = 'P0001',
        message = format(
          'Inventario insuficiente: %s tiene %s disponibles y se solicitaron %s.',
          v_inventory_item.name,
          v_inventory_item.stock_quantity,
          v_inventory_item.requested_quantity
        );
    end if;

    update public.productos
      set stock_quantity = stock_quantity - v_inventory_item.requested_quantity
    where id = v_inventory_item.id
      and negocio_id = v_negocio_id
      and item_type = 'product';
  end loop;

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
    v_payment_items,
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

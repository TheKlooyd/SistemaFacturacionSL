-- Apply only after reviewing and approving the production deployment.
create table mobile_private.catalog_creations (
  user_id uuid not null references auth.users(id) on delete cascade,
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  request_id uuid not null,
  payload jsonb not null,
  product_id uuid not null,
  primary key(user_id, negocio_id, request_id)
);
alter table mobile_private.catalog_creations enable row level security;
revoke all on mobile_private.catalog_creations from public, anon, authenticated;

create function mobile_private.workspace(p_action text, p_negocio uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := mobile_private.require_owner(p_negocio);
  zone text;
  today date;
  sid uuid;
  v_request_id uuid;
  category_id uuid;
  product_id uuid;
  item_name text;
  item_type text;
  sale_price numeric;
  purchase_price numeric;
  stock numeric;
  normalized jsonb;
  prior mobile_private.catalog_creations;
begin
  if p_action = 'daily' then
    select coalesce(c.timezone, 'America/Bogota') into zone
    from public.negocio_configuracion c where c.negocio_id = p_negocio;
    zone := coalesce(zone, 'America/Bogota');
    today := (now() at time zone zone)::date;
    return jsonb_build_object(
      'date', today,
      'sales', (select coalesce(sum(p.total_with_tip - p.tip_amount), 0)::text
        from public.pagos p where p.negocio_id = p_negocio
        and p.created_at >= today::timestamp at time zone zone
        and p.created_at < (today + 1)::timestamp at time zone zone),
      'tickets', (select count(*) from public.pagos p where p.negocio_id = p_negocio
        and p.created_at >= today::timestamp at time zone zone
        and p.created_at < (today + 1)::timestamp at time zone zone),
      'stationLabel', coalesce((select c.nombre_estacion_plural from public.negocio_configuracion c
        where c.negocio_id = p_negocio), 'Mesas'),
      'stationsTotal', (select count(*) from public.mesas m
        where m.negocio_id = p_negocio and m.is_active is not false),
      'stationsBusy', (select count(*) from public.mesas m
        where m.negocio_id = p_negocio and m.is_active is not false
        and exists (select 1 from public.ordenes o where o.negocio_id = p_negocio
          and o.table_id = m.id::text and o.status = 'OPEN')),
      'lowStock', (select count(*) from public.productos p
        where p.negocio_id = p_negocio and p.item_type = 'product' and p.stock_quantity <= 2),
      'outOfStock', (select count(*) from public.productos p
        where p.negocio_id = p_negocio and p.item_type = 'product' and p.stock_quantity = 0),
      'unread', (select count(*) from mobile_private.notifications n
        where n.negocio_id = p_negocio and n.user_id = u and n.read_at is null),
      'lastClose', (select jsonb_build_object('id', c.id, 'date', c.date_iso, 'summary', c.data->'summary')
        from public.cierres_diarios c where c.negocio_id = p_negocio order by c.date_iso desc limit 1)
    );
  elsif p_action = 'create_catalog_item' then
    sid := nullif(auth.jwt()->>'session_id', '')::uuid;
    if not exists(select 1 from auth.sessions where id = sid and user_id = u) then
      raise exception 'Vuelve a iniciar sesión.' using errcode = '42501';
    end if;
    update mobile_private.admin_sessions set last_used_at = now()
    where token_hash = encode(extensions.digest(p_payload->>'token', 'sha256'), 'hex')
      and user_id = u and negocio_id = p_negocio and auth_session_id = sid
      and device_id = (p_payload->>'deviceId')::uuid and purpose = 'inventory_adjust'
      and expires_at > now() and last_used_at > now() - interval '2 minutes';
    if not found then raise exception 'Verifica tu PIN nuevamente.' using errcode = '42501'; end if;

    v_request_id := nullif(p_payload->>'requestId', '')::uuid;
    category_id := nullif(p_payload->>'categoryId', '')::uuid;
    item_name := btrim(p_payload->>'name');
    item_type := p_payload->>'itemType';
    sale_price := nullif(p_payload->>'price', '')::numeric;
    purchase_price := nullif(p_payload->>'purchasePrice', '')::numeric;
    stock := nullif(p_payload->>'stock', '')::numeric;
    if v_request_id is null or category_id is null or item_name is null or length(item_name) not between 1 and 200
      or item_type is null or item_type not in ('product', 'service')
      or sale_price is null or sale_price <= 0 or sale_price > 9999999999.99 or sale_price <> round(sale_price, 2)
      or purchase_price is null or purchase_price < 0 or purchase_price > 9999999999.99 or purchase_price <> round(purchase_price, 2)
      or stock is null or stock < 0 or stock > 9999999999.99 or stock <> round(stock, 2)
      or (item_type = 'service' and (purchase_price <> 0 or stock <> 0)) then
      raise exception 'Datos del artículo no válidos.';
    end if;
    normalized := jsonb_build_object('categoryId', category_id, 'name', item_name, 'itemType', item_type,
      'price', sale_price, 'purchasePrice', purchase_price, 'stock', stock);
    perform pg_advisory_xact_lock(hashtextextended(u::text || p_negocio::text || v_request_id::text, 0));
    select * into prior from mobile_private.catalog_creations
      where user_id = u and negocio_id = p_negocio and request_id = v_request_id;
    if found then
      if prior.payload <> normalized then raise exception 'La clave de reintento pertenece a otro artículo.'; end if;
      return jsonb_build_object('id', prior.product_id);
    end if;
    if not exists(select 1 from public.categorias c where c.id = category_id and c.negocio_id = p_negocio) then
      raise exception 'Selecciona una categoría de este negocio.';
    end if;
    product_id := gen_random_uuid();
    insert into public.productos(id, negocio_id, category_id, name, item_type, price, purchase_price, stock_quantity)
    values(product_id, p_negocio, category_id, item_name, item_type, sale_price, purchase_price, stock);
    if item_type = 'product' and stock > 0 then
      insert into mobile_private.inventory_movements(negocio_id, producto_id, tipo, delta, stock_anterior, stock_nuevo, motivo, actor_user_id)
      values(p_negocio, product_id, 'entrada', stock, 0, stock, 'Existencia inicial al crear producto', u);
    end if;
    insert into mobile_private.catalog_creations(user_id, negocio_id, request_id, payload, product_id)
    values(u, p_negocio, v_request_id, normalized, product_id);
    return jsonb_build_object('id', product_id);
  end if;
  raise exception 'Operación no admitida.';
end $$;

create function public.klooyd_mobile_workspace(p_action text, p_negocio uuid, p_payload jsonb default '{}')
returns jsonb language sql security invoker set search_path = '' as $$
  select mobile_private.workspace(p_action, p_negocio, p_payload)
$$;
revoke all on function mobile_private.workspace(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function mobile_private.workspace(text, uuid, jsonb) to authenticated;
revoke all on function public.klooyd_mobile_workspace(text, uuid, jsonb) from public, anon;
grant execute on function public.klooyd_mobile_workspace(text, uuid, jsonb) to authenticated;

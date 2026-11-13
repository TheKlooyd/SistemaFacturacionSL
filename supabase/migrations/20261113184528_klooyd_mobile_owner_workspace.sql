-- PROPOSAL ONLY: requires Kenneth's approval before applying to production.
-- Does not revoke the explicitly approved POS inventory permissions.
create schema if not exists mobile_private;
revoke all on schema mobile_private from public, anon, authenticated;
grant usage on schema mobile_private to authenticated, service_role;

create table mobile_private.pins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hash text not null,
  failures integer not null default 0,
  blocks integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
create table mobile_private.pin_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null, negocio_id uuid not null,
  success boolean not null, created_at timestamptz not null default now()
);
create index on mobile_private.pin_attempts(user_id, created_at);
create table mobile_private.admin_sessions (
  token_hash text primary key, user_id uuid not null references auth.users(id) on delete cascade,
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  auth_session_id uuid not null, device_id uuid not null,
  purpose text not null check (purpose = 'inventory_adjust'),
  created_at timestamptz not null default now(), last_used_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index on mobile_private.admin_sessions(user_id);
create table mobile_private.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id),
  -- Keep the historical identifier if the POS later deletes a catalog item.
  producto_id uuid not null,
  tipo text not null, delta numeric(12,2) not null,
  stock_anterior numeric(12,2) not null, stock_nuevo numeric(12,2) not null check (stock_nuevo >= 0),
  motivo text not null, actor_user_id uuid,
  idempotency_key uuid, created_at timestamptz not null default now(),
  unique(negocio_id, actor_user_id, idempotency_key)
);
create index on mobile_private.inventory_movements(negocio_id, producto_id, created_at desc);
create table mobile_private.preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  stock_enabled boolean not null default true, close_enabled boolean not null default true,
  show_details boolean not null default false,
  primary key(user_id, negocio_id)
);
create table mobile_private.push_subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  device_id uuid not null, subscription jsonb not null, label text not null,
  created_at timestamptz not null default now(), unique(user_id, negocio_id, device_id)
);
create table mobile_private.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  kind text not null check(kind in ('stock','close')), event_key text not null,
  title text not null, body text not null, href text not null,
  details jsonb not null default '{}', created_at timestamptz not null default now(), read_at timestamptz,
  unique(user_id, negocio_id, event_key)
);
create index on mobile_private.notifications(user_id, negocio_id, created_at desc);
create table mobile_private.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references mobile_private.notifications(id) on delete cascade,
  subscription_id uuid not null references mobile_private.push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','sending','accepted','failed')),
  attempts integer not null default 0, available_at timestamptz not null default now(),
  lease_id uuid, last_error text, accepted_at timestamptz,
  unique(notification_id, subscription_id)
);
create index on mobile_private.push_deliveries(available_at) where status in ('pending','sending');

-- Private tables have no direct client privileges, even if the schema is exposed accidentally.
do $$ declare t text; begin
  foreach t in array array['pins','pin_attempts','admin_sessions','inventory_movements','preferences','push_subscriptions','notifications','push_deliveries'] loop
    execute format('alter table mobile_private.%I enable row level security', t);
    execute format('revoke all on mobile_private.%I from public, anon, authenticated', t);
  end loop;
end $$;

create function mobile_private.require_owner(p_negocio uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null or not exists (
    select 1 from public.negocio_usuarios m join public.negocios n on n.id=m.negocio_id
    join public.suscripciones s on s.negocio_id=n.id
    where m.user_id=u and m.negocio_id=p_negocio and m.is_active and m.rol='propietario'
    and n.estado='activo' and s.estado='activa'
    and (s.starts_at is null or s.starts_at<=now()) and (s.ends_at is null or s.ends_at>now())
  ) then raise exception 'Acceso de propietario no autorizado.' using errcode='42501'; end if;
  return u;
end $$;

create function mobile_private.pin_set(p_user uuid, p_negocio uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_pin !~ '^[0-9]{6,12}$' or p_pin is null then raise exception 'El PIN debe tener de 6 a 12 dígitos.'; end if;
  if not exists(select 1 from public.negocio_usuarios where user_id=p_user and negocio_id=p_negocio and is_active and rol='propietario') then
    raise exception 'Acceso no autorizado.' using errcode='42501';
  end if;
  insert into mobile_private.pins(user_id,hash) values(p_user, extensions.crypt(p_pin,extensions.gen_salt('bf',12)))
  on conflict(user_id) do update set hash=excluded.hash,failures=0,blocks=0,locked_until=null,updated_at=now();
  delete from mobile_private.admin_sessions where user_id=p_user;
  insert into mobile_private.pin_attempts(user_id,negocio_id,success) values(p_user,p_negocio,true);
  return jsonb_build_object('ok',true);
end $$;

create function mobile_private.pin_verify(p_negocio uuid, p_pin text, p_device uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := mobile_private.require_owner(p_negocio); r mobile_private.pins; token text; sid uuid;
begin
  sid := nullif(auth.jwt()->>'session_id','')::uuid;
  if p_device is null or not exists(select 1 from auth.sessions where id=sid and user_id=u) then
    raise exception 'Vuelve a iniciar sesión.' using errcode='42501';
  end if;
  select * into r from mobile_private.pins where user_id=u for update;
  if not found then return jsonb_build_object('ok',false,'error','Configura primero tu PIN.'); end if;
  if r.locked_until>now() then return jsonb_build_object('ok',false,'error','PIN bloqueado temporalmente.','retryAt',r.locked_until); end if;
  if p_pin is null or p_pin !~ '^[0-9]{6,12}$' or extensions.crypt(p_pin,r.hash)<>r.hash then
    r.failures := r.failures+1;
    update mobile_private.pins set failures=case when r.failures>=5 then 0 else r.failures end,
      blocks=case when r.failures>=5 then least(r.blocks+1,5) else r.blocks end,
      locked_until=case when r.failures>=5 then now()+make_interval(secs=>least(60*power(2,least(r.blocks,4))::int,900)) else null end
      where user_id=u;
    insert into mobile_private.pin_attempts(user_id,negocio_id,success) values(u,p_negocio,false);
    -- Return instead of raising: attempt counters must commit on a failed PIN.
    return jsonb_build_object('ok',false,'error','PIN incorrecto.');
  end if;
  update mobile_private.pins set failures=0,blocks=0,locked_until=null where user_id=u;
  insert into mobile_private.pin_attempts(user_id,negocio_id,success) values(u,p_negocio,true);
  delete from mobile_private.admin_sessions where user_id=u and (expires_at<now() or (negocio_id=p_negocio and device_id=p_device));
  token := encode(extensions.gen_random_bytes(32),'hex');
  insert into mobile_private.admin_sessions(token_hash,user_id,negocio_id,auth_session_id,device_id,purpose,expires_at)
  values(encode(extensions.digest(token,'sha256'),'hex'),u,p_negocio,sid,p_device,'inventory_adjust',now()+interval '5 minutes');
  return jsonb_build_object('ok',true,'token',token,'expiresAt',now()+interval '5 minutes');
end $$;

create function mobile_private.emit(p_negocio uuid,p_kind text,p_key text,p_title text,p_body text,p_href text,p_details jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare n record;
begin
  for n in
    insert into mobile_private.notifications(user_id,negocio_id,kind,event_key,title,body,href,details)
    select user_id,p_negocio,p_kind,p_key,p_title,p_body,p_href,p_details from public.negocio_usuarios
    where negocio_id=p_negocio and is_active and rol='propietario'
    on conflict(user_id,negocio_id,event_key) do nothing returning *
  loop
    insert into mobile_private.push_deliveries(notification_id,subscription_id)
    select n.id,s.id from mobile_private.push_subscriptions s
    left join mobile_private.preferences p on p.user_id=s.user_id and p.negocio_id=s.negocio_id
    where s.user_id=n.user_id and s.negocio_id=p_negocio
    and case when p_kind='stock' then coalesce(p.stock_enabled,true) else coalesce(p.close_enabled,true) end
    on conflict do nothing;
  end loop;
end $$;

create function mobile_private.record_stock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare movement uuid;
begin
  if new.item_type<>'product' or new.stock_quantity=old.stock_quantity then return new; end if;
  insert into mobile_private.inventory_movements(negocio_id,producto_id,tipo,delta,stock_anterior,stock_nuevo,motivo,actor_user_id,idempotency_key)
  values(new.negocio_id,new.id,case when new.stock_quantity>old.stock_quantity then 'entrada' else 'salida' end,
    new.stock_quantity-old.stock_quantity,old.stock_quantity,new.stock_quantity,
    coalesce(nullif(current_setting('klooyd_mobile.reason',true),''),'Operación de inventario desde POS'),
    auth.uid(),nullif(current_setting('klooyd_mobile.idempotency',true),'')::uuid) returning id into movement;
  if old.stock_quantity>2 and new.stock_quantity<=2 then
    perform mobile_private.emit(new.negocio_id,'stock','stock:'||movement,'Stock bajo',
      new.name||': quedan '||new.stock_quantity||' unidades.','/mobile/inventario/'||new.id,
      jsonb_build_object('productoId',new.id,'stock',new.stock_quantity));
  end if;
  return new;
end $$;
create trigger mobile_stock_movement after update of stock_quantity on public.productos
for each row execute function mobile_private.record_stock();

create function mobile_private.record_close() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform mobile_private.emit(new.negocio_id,'close','close:'||new.id,'Cierre de caja guardado',
    'Cierre del '||new.date_iso||'. Consulta el resumen en Klooyd.','/mobile/cierres/'||new.id,
    jsonb_build_object('closeId',new.id,'date',new.date_iso,'summary',new.data->'summary','breakdown',new.data->'breakdown',
      'payments',(select coalesce(jsonb_agg(jsonb_build_object('id',p->>'id','subtotal',p->'subtotal','totalWithTip',p->'totalWithTip','tipAmount',p->'tipAmount','method',p->'method','paymentSplits',p->'paymentSplits')),'[]') from jsonb_array_elements(new.data->'payments') p)));
  return new;
end $$;
create trigger mobile_daily_close after insert or update of data on public.cierres_diarios
for each row execute function mobile_private.record_close();

create function mobile_private.api(p_action text,p_negocio uuid,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); result jsonb; zone text; first_day date; month_start date; month_end date;
  product public.productos; movement mobile_private.inventory_movements;
  delta numeric; reason text; request_id uuid; sid uuid; endpoint text;
begin
  if u is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
  if p_action='logout_device' then
    delete from mobile_private.push_subscriptions where user_id=u and device_id=(p_payload->>'deviceId')::uuid;
    delete from mobile_private.admin_sessions where user_id=u and device_id=(p_payload->>'deviceId')::uuid;
    return jsonb_build_object('ok',true);
  end if;
  if p_action='context' then
    select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'name',coalesce(c.nombre_comercial,n.nombre),
      'timezone',coalesce(c.timezone,'America/Bogota'),'currency',coalesce(c.moneda,'COP')) order by n.nombre),'[]') into result
    from public.negocio_usuarios m join public.negocios n on n.id=m.negocio_id
    join public.suscripciones s on s.negocio_id=n.id left join public.negocio_configuracion c on c.negocio_id=n.id
    where m.user_id=u and m.is_active and m.rol='propietario' and n.estado='activo' and s.estado='activa'
    and (s.starts_at is null or s.starts_at<=now()) and (s.ends_at is null or s.ends_at>now());
    return jsonb_build_object('businesses',result,'pinConfigured',exists(select 1 from mobile_private.pins where user_id=u));
  end if;
  perform mobile_private.require_owner(p_negocio);
  select coalesce(timezone,'America/Bogota') into zone from public.negocio_configuracion where negocio_id=p_negocio;
  zone := coalesce(zone,'America/Bogota');
  if p_action='dashboard' then
    month_start := coalesce(nullif(p_payload->>'month','')::date,date_trunc('month',now() at time zone zone)::date);
    if extract(day from month_start)<>1 or month_start>date_trunc('month',now() at time zone zone)::date then raise exception 'Mes inválido.'; end if;
    month_end := (month_start+interval '1 month')::date;
    select (min(created_at) at time zone zone)::date into first_day from public.pagos where negocio_id=p_negocio;
    select jsonb_build_object('month',month_start,'firstDay',first_day,
      'historical',coalesce((select sum(total_with_tip-tip_amount) from public.pagos where negocio_id=p_negocio),0)::text,
      'days',(select jsonb_agg(jsonb_build_object('date',d::date,'sales',coalesce(p.sales,0)::text,'tickets',coalesce(p.tickets,0)) order by d)
        from generate_series(month_start::timestamp,(month_end-1)::timestamp,interval '1 day') d
        left join (select (created_at at time zone zone)::date as day,sum(total_with_tip-tip_amount) as sales,count(*) as tickets
          from public.pagos where negocio_id=p_negocio and created_at>=month_start::timestamp at time zone zone
          and created_at<month_end::timestamp at time zone zone group by 1) p on p.day=d::date),
      'lowStock',(select count(*) from public.productos where negocio_id=p_negocio and item_type='product' and stock_quantity<=2),
      'outOfStock',(select count(*) from public.productos where negocio_id=p_negocio and item_type='product' and stock_quantity=0),
      'unread',(select count(*) from mobile_private.notifications where negocio_id=p_negocio and user_id=u and read_at is null),
      'lastClose',(select jsonb_build_object('id',id,'date',date_iso,'summary',data->'summary') from public.cierres_diarios where negocio_id=p_negocio order by date_iso desc limit 1),
      'suspectedDuplicates',(select count(*) from (select created_at-lag(created_at) over(partition by table_id,subtotal,tip_amount,discount_amount,total_with_tip,paid_amount,method,payment_splits,items order by created_at,id) as gap
        from public.pagos where negocio_id=p_negocio and created_at>=month_start::timestamp at time zone zone-interval '15 seconds'
        and created_at<month_end::timestamp at time zone zone) candidate where gap<=interval '15 seconds')) into result;
    return result;
  elsif p_action='categories' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]') into result
      from public.categorias where negocio_id=p_negocio; return result;
  elsif p_action='inventory' then
    select coalesce(jsonb_agg(to_jsonb(p)),'[]') into result from (
      select p.id,p.name,p.stock_quantity::text,p.category_id,c.name as category
      from public.productos p left join public.categorias c on c.id=p.category_id and c.negocio_id=p.negocio_id
      where p.negocio_id=p_negocio and p.item_type='product'
      and (coalesce(p_payload->>'search','')='' or p.name ilike '%'||left(p_payload->>'search',100)||'%')
      and (coalesce(p_payload->>'category','')='' or p.category_id=(p_payload->>'category')::uuid)
      and (coalesce(p_payload->>'stock','all')='all' or ((p_payload->>'stock')='low' and p.stock_quantity<=2) or ((p_payload->>'stock')='empty' and p.stock_quantity=0))
      order by p.name,p.id limit 51 offset least(greatest(coalesce((p_payload->>'offset')::int,0),0),100000)
    ) p; return result;
  elsif p_action='product' then
    select * into product from public.productos where id=(p_payload->>'id')::uuid and negocio_id=p_negocio and item_type='product';
    if not found then raise exception 'Producto no disponible.'; end if;
    return jsonb_build_object('id',product.id,'name',product.name,'stock',product.stock_quantity::text,
      'movements',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from (select h.id,h.tipo,h.delta::text,h.stock_anterior::text,h.stock_nuevo::text,h.motivo,h.actor_user_id,h.created_at
        from mobile_private.inventory_movements h where h.negocio_id=p_negocio and h.producto_id=product.id order by h.created_at desc limit 50) m));
  elsif p_action='closes' then
    select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from (
      select id,date_iso,created_at,data->'summary' as summary from public.cierres_diarios where negocio_id=p_negocio
      order by date_iso desc limit 31 offset least(greatest(coalesce((p_payload->>'offset')::int,0),0),100000)
    ) c; return result;
  elsif p_action='close' then
    select jsonb_build_object('id',id,'date',date_iso,'data',data) into result from public.cierres_diarios where negocio_id=p_negocio and id=(p_payload->>'id')::uuid;
    if result is null then raise exception 'Cierre no disponible.'; end if; return result;
  elsif p_action='pin_verify' then
    return mobile_private.pin_verify(p_negocio,p_payload->>'pin',(p_payload->>'deviceId')::uuid);
  elsif p_action='adjust' then
    sid := nullif(auth.jwt()->>'session_id','')::uuid;
    if not exists(select 1 from auth.sessions where id=sid and user_id=u) then raise exception 'Vuelve a iniciar sesión.' using errcode='42501'; end if;
    update mobile_private.admin_sessions set last_used_at=now()
      where token_hash=encode(extensions.digest(p_payload->>'token','sha256'),'hex') and user_id=u and negocio_id=p_negocio
      and auth_session_id=sid and device_id=(p_payload->>'deviceId')::uuid and purpose='inventory_adjust'
      and expires_at>now() and last_used_at>now()-interval '2 minutes';
    if not found then raise exception 'Verifica tu PIN nuevamente.' using errcode='42501'; end if;
    delta := (p_payload->>'delta')::numeric; reason := btrim(p_payload->>'reason'); request_id := (p_payload->>'idempotencyKey')::uuid;
    if delta is null or delta=0 or abs(delta)>9999999999 or delta<>round(delta,2) or reason is null or length(reason)<3 or length(reason)>240 or request_id is null then raise exception 'Cantidad y motivo no válidos.'; end if;
    perform pg_advisory_xact_lock(hashtextextended(u::text||p_negocio::text||request_id::text,0));
    select * into movement from mobile_private.inventory_movements where negocio_id=p_negocio and actor_user_id=u and idempotency_key=request_id;
    if found then
      if movement.producto_id<>(p_payload->>'id')::uuid or movement.delta<>delta or movement.motivo<>reason then raise exception 'La clave de reintento pertenece a otro ajuste.'; end if;
      return to_jsonb(movement);
    end if;
    select * into product from public.productos where negocio_id=p_negocio and id=(p_payload->>'id')::uuid and item_type='product' for update;
    if not found then raise exception 'Producto no disponible.'; end if;
    if (p_payload->>'expectedStock') is null or product.stock_quantity<>(p_payload->>'expectedStock')::numeric then raise exception 'El stock cambió. Actualiza y confirma nuevamente.'; end if;
    if product.stock_quantity+delta<0 then raise exception 'El ajuste no puede dejar stock negativo.'; end if;
    perform set_config('klooyd_mobile.reason',reason,true);
    perform set_config('klooyd_mobile.idempotency',request_id::text,true);
    update public.productos set stock_quantity=stock_quantity+delta where id=product.id and negocio_id=p_negocio;
    perform set_config('klooyd_mobile.reason','',true); perform set_config('klooyd_mobile.idempotency','',true);
    select to_jsonb(m) into result from mobile_private.inventory_movements m where negocio_id=p_negocio and actor_user_id=u and idempotency_key=request_id;
    return result;
  elsif p_action='notifications' then
    select coalesce(jsonb_agg(to_jsonb(n)),'[]') into result from (select id,kind,title,body,href,created_at,read_at,details
      from mobile_private.notifications where user_id=u and negocio_id=p_negocio order by created_at desc limit 51
      offset least(greatest(coalesce((p_payload->>'offset')::int,0),0),100000)) n; return result;
  elsif p_action='mark_read' then
    update mobile_private.notifications set read_at=coalesce(read_at,now()) where user_id=u and negocio_id=p_negocio and id=(p_payload->>'id')::uuid;
    return jsonb_build_object('ok',true);
  elsif p_action='settings' then
    return jsonb_build_object('preferences',coalesce((select to_jsonb(p)-'user_id'-'negocio_id' from mobile_private.preferences p where user_id=u and negocio_id=p_negocio),'{"stock_enabled":true,"close_enabled":true,"show_details":false}'),
      'devices',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'deviceId',device_id,'label',label,'createdAt',created_at)),'[]') from mobile_private.push_subscriptions where user_id=u and negocio_id=p_negocio));
  elsif p_action='preferences' then
    insert into mobile_private.preferences(user_id,negocio_id,stock_enabled,close_enabled,show_details)
    values(u,p_negocio,coalesce((p_payload->>'stock_enabled')::boolean,true),coalesce((p_payload->>'close_enabled')::boolean,true),coalesce((p_payload->>'show_details')::boolean,false))
    on conflict(user_id,negocio_id) do update set stock_enabled=excluded.stock_enabled,close_enabled=excluded.close_enabled,show_details=excluded.show_details;
    return jsonb_build_object('ok',true);
  elsif p_action='subscribe' then
    endpoint := p_payload->'subscription'->>'endpoint';
    if endpoint is null or endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-zA-Z0-9.-]+\.push\.apple\.com|web\.push\.apple\.com|[a-zA-Z0-9.-]+\.notify\.windows\.com)/' then raise exception 'Proveedor push no admitido.'; end if;
    if length(coalesce(p_payload->'subscription'->'keys'->>'p256dh','')) not between 80 and 100 or length(coalesce(p_payload->'subscription'->'keys'->>'auth','')) not between 20 and 30 then raise exception 'Suscripción inválida.'; end if;
    insert into mobile_private.push_subscriptions(user_id,negocio_id,device_id,subscription,label)
    values(u,p_negocio,(p_payload->>'deviceId')::uuid,p_payload->'subscription',left(coalesce(p_payload->>'label','Dispositivo'),80))
    on conflict(user_id,negocio_id,device_id) do update set subscription=excluded.subscription,label=excluded.label;
    return jsonb_build_object('ok',true);
  elsif p_action='unsubscribe' then
    delete from mobile_private.push_subscriptions where user_id=u and negocio_id=p_negocio and id=(p_payload->>'id')::uuid;
    return jsonb_build_object('ok',true);
  elsif p_action='lock' then
    delete from mobile_private.admin_sessions where user_id=u and negocio_id=p_negocio and device_id=(p_payload->>'deviceId')::uuid;
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Operación no admitida.';
end $$;

create function public.klooyd_mobile(p_action text,p_negocio uuid default null,p_payload jsonb default '{}') returns jsonb
language sql security invoker set search_path = '' as $$ select mobile_private.api(p_action,p_negocio,p_payload) $$;
create function public.klooyd_mobile_pin_set(p_user uuid,p_negocio uuid,p_pin text) returns jsonb
language sql security invoker set search_path = '' as $$ select mobile_private.pin_set(p_user,p_negocio,p_pin) $$;

revoke all on all functions in schema mobile_private from public, anon, authenticated;
grant execute on function mobile_private.api(text,uuid,jsonb) to authenticated;
grant execute on function mobile_private.pin_set(uuid,uuid,text) to service_role;
revoke all on function public.klooyd_mobile(text,uuid,jsonb) from public,anon;
grant execute on function public.klooyd_mobile(text,uuid,jsonb) to authenticated;
revoke all on function public.klooyd_mobile_pin_set(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.klooyd_mobile_pin_set(uuid,uuid,text) to service_role;

create function mobile_private.push_claim() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  update mobile_private.push_deliveries set status='failed',last_error='Delivery lease exhausted',lease_id=null
    where status='sending' and attempts>=8 and available_at<=now();
  -- Recheck ownership and preferences at delivery, not only when the event was created.
  update mobile_private.push_deliveries d set status='failed',last_error='Recipient no longer eligible'
  from mobile_private.notifications n where n.id=d.notification_id and d.status in ('pending','sending')
  and (not exists(select 1 from public.negocio_usuarios m where m.user_id=n.user_id and m.negocio_id=n.negocio_id and m.is_active and m.rol='propietario')
    or exists(select 1 from mobile_private.preferences p where p.user_id=n.user_id and p.negocio_id=n.negocio_id and
      ((n.kind='stock' and not p.stock_enabled) or (n.kind='close' and not p.close_enabled))));
  with candidates as (
    select id from mobile_private.push_deliveries where status in ('pending','sending') and available_at<=now() and attempts<8
    order by available_at limit 12 for update skip locked
  ), claimed as (
    update mobile_private.push_deliveries d set status='sending',attempts=attempts+1,lease_id=gen_random_uuid(),available_at=now()+interval '3 minutes'
    from candidates c where d.id=c.id returning d.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'leaseId',d.lease_id,'notificationId',n.id,'kind',n.kind,
    'businessId',n.negocio_id,'businessName',b.nombre,'title',n.title,'body',n.body,'href',n.href,'details',n.details,
    'showDetails',coalesce(p.show_details,false),'subscription',s.subscription)),'[]') into result
  from claimed d join mobile_private.notifications n on n.id=d.notification_id
  join mobile_private.push_subscriptions s on s.id=d.subscription_id join public.negocios b on b.id=n.negocio_id
  left join mobile_private.preferences p on p.user_id=n.user_id and p.negocio_id=n.negocio_id;
  return result;
end $$;
create function mobile_private.push_finish(p_id uuid,p_lease uuid,p_status text,p_expired boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare sub uuid;
begin
  if p_status not in ('accepted','retry','failed') then raise exception 'Invalid delivery status'; end if;
  update mobile_private.push_deliveries set
    status=case when p_status='retry' and attempts<8 then 'pending' when p_status='accepted' then 'accepted' else 'failed' end,
    available_at=now()+make_interval(secs=>least(60*power(2,attempts)::int,3600)),
    accepted_at=case when p_status='accepted' then now() else null end,
    last_error=case when p_status='accepted' then null else p_status end,lease_id=null
    where id=p_id and lease_id=p_lease and status='sending' returning subscription_id into sub;
  if p_expired and sub is not null then delete from mobile_private.push_subscriptions where id=sub; end if;
end $$;
create function public.klooyd_mobile_push_claim() returns jsonb
language sql security invoker set search_path='' as $$ select mobile_private.push_claim() $$;
create function public.klooyd_mobile_push_finish(p_id uuid,p_lease uuid,p_status text,p_expired boolean default false) returns void
language sql security invoker set search_path='' as $$ select mobile_private.push_finish(p_id,p_lease,p_status,p_expired) $$;
revoke all on function mobile_private.push_claim(), mobile_private.push_finish(uuid,uuid,text,boolean),
  public.klooyd_mobile_push_claim(), public.klooyd_mobile_push_finish(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function mobile_private.push_claim(), mobile_private.push_finish(uuid,uuid,text,boolean),
  public.klooyd_mobile_push_claim(), public.klooyd_mobile_push_finish(uuid,uuid,text,boolean) to service_role;

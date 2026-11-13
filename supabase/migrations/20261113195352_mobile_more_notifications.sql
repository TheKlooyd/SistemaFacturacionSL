-- Más notificaciones móviles: facturas/cierres eliminados, facturas editadas y producto agotado.
-- Los detalles se muestran por defecto; el usuario puede volver al modo privado desde Ajustes.

alter table mobile_private.preferences
  add column invoice_enabled boolean not null default true,
  add column invoice_edit_enabled boolean not null default true,
  add column close_delete_enabled boolean not null default true;
alter table mobile_private.preferences alter column show_details set default true;
update mobile_private.preferences set show_details = true;

alter table mobile_private.notifications drop constraint notifications_kind_check;
alter table mobile_private.notifications add constraint notifications_kind_check
  check(kind in ('stock','close','invoice_deleted','invoice_edited','close_deleted'));

create function mobile_private.pref_on(p_user uuid,p_negocio uuid,p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select case p_kind
      when 'stock' then p.stock_enabled when 'close' then p.close_enabled
      when 'invoice_deleted' then p.invoice_enabled when 'invoice_edited' then p.invoice_edit_enabled
      when 'close_deleted' then p.close_delete_enabled end
    from mobile_private.preferences p where p.user_id=p_user and p.negocio_id=p_negocio),true)
$$;

create or replace function mobile_private.emit(p_negocio uuid,p_kind text,p_key text,p_title text,p_body text,p_href text,p_details jsonb) returns void
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
    where s.user_id=n.user_id and s.negocio_id=p_negocio and mobile_private.pref_on(n.user_id,p_negocio,p_kind)
    on conflict do nothing;
  end loop;
end $$;

create function mobile_private.fmt_money(p_value numeric) returns text
language sql immutable set search_path = '' as $$
  select '$'||replace(to_char(coalesce(p_value,0),'FM999,999,999,990'),',','.')
$$;

create function mobile_private.fmt_time(p_negocio uuid,p_ts timestamptz) returns text
language sql stable security definer set search_path = '' as $$
  select to_char(p_ts at time zone coalesce((select timezone from public.negocio_configuracion where negocio_id=p_negocio),'America/Bogota'),'DD/MM/YYYY HH12:MI AM')
$$;

create function mobile_private.actor_label() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select ' Por '||email from auth.users where id=auth.uid()),'')
$$;

create or replace function mobile_private.record_stock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare movement uuid;
begin
  if new.item_type<>'product' or new.stock_quantity=old.stock_quantity then return new; end if;
  insert into mobile_private.inventory_movements(negocio_id,producto_id,tipo,delta,stock_anterior,stock_nuevo,motivo,actor_user_id,idempotency_key)
  values(new.negocio_id,new.id,case when new.stock_quantity>old.stock_quantity then 'entrada' else 'salida' end,
    new.stock_quantity-old.stock_quantity,old.stock_quantity,new.stock_quantity,
    coalesce(nullif(current_setting('klooyd_mobile.reason',true),''),'Operación de inventario desde POS'),
    auth.uid(),nullif(current_setting('klooyd_mobile.idempotency',true),'')::uuid) returning id into movement;
  if old.stock_quantity>0 and new.stock_quantity<=0 then
    perform mobile_private.emit(new.negocio_id,'stock','stock:'||movement,'Producto agotado',
      new.name||' se agotó: quedan 0 unidades.','/mobile/inventario/'||new.id,
      jsonb_build_object('productoId',new.id,'stock',new.stock_quantity));
  elsif old.stock_quantity>2 and new.stock_quantity<=2 then
    perform mobile_private.emit(new.negocio_id,'stock','stock:'||movement,'Stock bajo',
      new.name||': quedan '||trim_scale(new.stock_quantity)::text||case when new.stock_quantity=1 then ' unidad.' else ' unidades.' end,
      '/mobile/inventario/'||new.id,jsonb_build_object('productoId',new.id,'stock',new.stock_quantity));
  end if;
  return new;
end $$;

create function mobile_private.record_invoice_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.negocios where id=old.negocio_id) then return old; end if;
  perform mobile_private.emit(old.negocio_id,'invoice_deleted','invoice_del:'||old.id,'Factura eliminada',
    'Factura del '||mobile_private.fmt_time(old.negocio_id,old.created_at)||' por '||mobile_private.fmt_money(old.total_with_tip)||
    coalesce(' · '||nullif(old.table_name,''),'')||coalesce(' · '||nullif(old.method,''),'')||'.'||mobile_private.actor_label(),
    '/mobile/notificaciones',
    jsonb_build_object('paymentId',old.id,'createdAt',old.created_at,'total',old.total_with_tip,'method',old.method,'table',old.table_name));
  return old;
end $$;
create trigger mobile_invoice_deleted after delete on public.pagos
for each row execute function mobile_private.record_invoice_delete();

create function mobile_private.record_invoice_edit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform mobile_private.emit(new.negocio_id,'invoice_edited','invoice_edit:'||new.id||':'||gen_random_uuid(),'Factura editada',
    'Factura del '||mobile_private.fmt_time(new.negocio_id,new.created_at)||' editada: '||mobile_private.fmt_money(old.total_with_tip)||
    ' → '||mobile_private.fmt_money(new.total_with_tip)||'.'||mobile_private.actor_label(),
    '/mobile/notificaciones',
    jsonb_build_object('paymentId',new.id,'createdAt',new.created_at,'before',old.total_with_tip,'after',new.total_with_tip));
  return new;
end $$;
create trigger mobile_invoice_edited after update of items,subtotal,total_with_tip,discount_amount,tip_amount on public.pagos
for each row when (old.items is distinct from new.items or old.subtotal is distinct from new.subtotal
  or old.total_with_tip is distinct from new.total_with_tip or old.discount_amount is distinct from new.discount_amount
  or old.tip_amount is distinct from new.tip_amount)
execute function mobile_private.record_invoice_edit();

create function mobile_private.record_close_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.negocios where id=old.negocio_id) then return old; end if;
  perform mobile_private.emit(old.negocio_id,'close_deleted','close_del:'||old.id,'Cierre diario eliminado',
    'Se eliminó el cierre del '||old.date_iso||coalesce(' (ventas '||mobile_private.fmt_money(nullif(old.data->'summary'->>'total','')::numeric)||')','')||'.'||mobile_private.actor_label(),
    '/mobile/cierres',jsonb_build_object('closeId',old.id,'date',old.date_iso,'summary',old.data->'summary'));
  return old;
end $$;
create trigger mobile_close_deleted after delete on public.cierres_diarios
for each row execute function mobile_private.record_close_delete();

create or replace function mobile_private.push_claim() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  update mobile_private.push_deliveries set status='failed',last_error='Delivery lease exhausted',lease_id=null
    where status='sending' and attempts>=8 and available_at<=now();
  update mobile_private.push_deliveries d set status='failed',last_error='Recipient no longer eligible'
  from mobile_private.notifications n where n.id=d.notification_id and d.status in ('pending','sending')
  and (not exists(select 1 from public.negocio_usuarios m where m.user_id=n.user_id and m.negocio_id=n.negocio_id and m.is_active and m.rol='propietario')
    or not mobile_private.pref_on(n.user_id,n.negocio_id,n.kind));
  with candidates as (
    select id from mobile_private.push_deliveries where status in ('pending','sending') and available_at<=now() and attempts<8
    order by available_at limit 12 for update skip locked
  ), claimed as (
    update mobile_private.push_deliveries d set status='sending',attempts=attempts+1,lease_id=gen_random_uuid(),available_at=now()+interval '3 minutes'
    from candidates c where d.id=c.id returning d.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'leaseId',d.lease_id,'notificationId',n.id,'kind',n.kind,
    'businessId',n.negocio_id,'businessName',b.nombre,'title',n.title,'body',n.body,'href',n.href,'details',n.details,
    'showDetails',coalesce(p.show_details,true),'subscription',s.subscription)),'[]') into result
  from claimed d join mobile_private.notifications n on n.id=d.notification_id
  join mobile_private.push_subscriptions s on s.id=d.subscription_id join public.negocios b on b.id=n.negocio_id
  left join mobile_private.preferences p on p.user_id=n.user_id and p.negocio_id=n.negocio_id;
  return result;
end $$;

-- Ajustes con las nuevas preferencias; el resto de acciones sigue en mobile_private.api.
create function mobile_private.api_settings(p_action text,p_negocio uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
  perform mobile_private.require_owner(p_negocio);
  if p_action='preferences' then
    insert into mobile_private.preferences(user_id,negocio_id,stock_enabled,close_enabled,show_details,invoice_enabled,invoice_edit_enabled,close_delete_enabled)
    values(u,p_negocio,coalesce((p_payload->>'stock_enabled')::boolean,true),coalesce((p_payload->>'close_enabled')::boolean,true),
      coalesce((p_payload->>'show_details')::boolean,true),coalesce((p_payload->>'invoice_enabled')::boolean,true),
      coalesce((p_payload->>'invoice_edit_enabled')::boolean,true),coalesce((p_payload->>'close_delete_enabled')::boolean,true))
    on conflict(user_id,negocio_id) do update set stock_enabled=excluded.stock_enabled,close_enabled=excluded.close_enabled,
      show_details=excluded.show_details,invoice_enabled=excluded.invoice_enabled,
      invoice_edit_enabled=excluded.invoice_edit_enabled,close_delete_enabled=excluded.close_delete_enabled;
    return jsonb_build_object('ok',true);
  end if;
  return jsonb_build_object('preferences',coalesce((select to_jsonb(p)-'user_id'-'negocio_id' from mobile_private.preferences p where user_id=u and negocio_id=p_negocio),
      '{"stock_enabled":true,"close_enabled":true,"show_details":true,"invoice_enabled":true,"invoice_edit_enabled":true,"close_delete_enabled":true}'),
    'devices',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'deviceId',device_id,'label',label,'createdAt',created_at)),'[]') from mobile_private.push_subscriptions where user_id=u and negocio_id=p_negocio));
end $$;

create or replace function public.klooyd_mobile(p_action text,p_negocio uuid default null,p_payload jsonb default '{}') returns jsonb
language sql security invoker set search_path = '' as $$
  select case when p_action in ('settings','preferences') then mobile_private.api_settings(p_action,p_negocio,p_payload)
    else mobile_private.api(p_action,p_negocio,p_payload) end
$$;

revoke all on all functions in schema mobile_private from public, anon, authenticated;
grant execute on function mobile_private.api(text,uuid,jsonb) to authenticated;
grant execute on function mobile_private.api_settings(text,uuid,jsonb) to authenticated;
grant execute on function mobile_private.pin_set(uuid,uuid,text) to service_role;

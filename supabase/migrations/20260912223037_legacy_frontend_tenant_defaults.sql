create or replace function public.assign_tenant_from_authenticated_user()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_negocio_id uuid;
  v_count integer;
begin
  if new.negocio_id is not null then
    return new;
  end if;

  select count(*), min(nu.negocio_id)
    into v_count, v_negocio_id
  from public.negocio_usuarios nu
  where nu.user_id = auth.uid()
    and nu.is_active = true;

  if v_count = 0 or v_negocio_id is null then
    raise exception 'No active business membership for authenticated user';
  end if;

  if v_count > 1 then
    raise exception 'Multiple active business memberships; negocio_id is required';
  end if;

  new.negocio_id := v_negocio_id;
  return new;
end;
$function$;

revoke all on function public.assign_tenant_from_authenticated_user() from public, anon, authenticated;
grant execute on function public.assign_tenant_from_authenticated_user() to service_role;

drop trigger if exists categorias_assign_tenant_legacy on public.categorias;
create trigger categorias_assign_tenant_legacy
before insert on public.categorias
for each row execute function public.assign_tenant_from_authenticated_user();

drop trigger if exists productos_assign_tenant_legacy on public.productos;
create trigger productos_assign_tenant_legacy
before insert on public.productos
for each row execute function public.assign_tenant_from_authenticated_user();

drop trigger if exists clientes_assign_tenant_legacy on public.clientes;
create trigger clientes_assign_tenant_legacy
before insert on public.clientes
for each row execute function public.assign_tenant_from_authenticated_user();

drop trigger if exists ordenes_assign_tenant_legacy on public.ordenes;
create trigger ordenes_assign_tenant_legacy
before insert on public.ordenes
for each row execute function public.assign_tenant_from_authenticated_user();

drop trigger if exists pagos_assign_tenant_legacy on public.pagos;
create trigger pagos_assign_tenant_legacy
before insert on public.pagos
for each row execute function public.assign_tenant_from_authenticated_user();

drop trigger if exists cierres_assign_tenant_legacy on public.cierres_diarios;
create trigger cierres_assign_tenant_legacy
before insert on public.cierres_diarios
for each row execute function public.assign_tenant_from_authenticated_user();

create or replace function public.assign_mesa_tenant_and_number_legacy()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_count integer;
  v_match text[];
begin
  if new.negocio_id is null then
    select count(*), min(nu.negocio_id)
      into v_count, new.negocio_id
    from public.negocio_usuarios nu
    where nu.user_id = auth.uid()
      and nu.is_active = true;

    if v_count = 0 or new.negocio_id is null then
      raise exception 'No active business membership for authenticated user';
    end if;

    if v_count > 1 then
      raise exception 'Multiple active business memberships; negocio_id is required';
    end if;
  end if;

  if new.numero is null then
    v_match := regexp_match(coalesce(new.name, ''), '(\d+)\s*$');
    if v_match is not null and array_length(v_match, 1) >= 1 then
      new.numero := (v_match[1])::integer;
    elsif new.id is not null and new.id between 1 and 12 then
      new.numero := new.id;
    else
      raise exception 'Mesa number is required';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.assign_mesa_tenant_and_number_legacy() from public, anon, authenticated;
grant execute on function public.assign_mesa_tenant_and_number_legacy() to service_role;

drop trigger if exists mesas_assign_tenant_legacy on public.mesas;
create trigger mesas_assign_tenant_legacy
before insert on public.mesas
for each row execute function public.assign_mesa_tenant_and_number_legacy();

create or replace function public.assign_tenant_from_authenticated_user()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_negocios uuid[];
begin
  if new.negocio_id is not null then
    return new;
  end if;

  select array_agg(nu.negocio_id order by nu.created_at)
    into v_negocios
  from public.negocio_usuarios nu
  where nu.user_id = auth.uid()
    and nu.is_active = true;

  if v_negocios is null or cardinality(v_negocios) = 0 then
    raise exception 'No active business membership for authenticated user';
  end if;

  if cardinality(v_negocios) > 1 then
    raise exception 'Multiple active business memberships; negocio_id is required';
  end if;

  new.negocio_id := v_negocios[1];
  return new;
end;
$function$;

create or replace function public.assign_mesa_tenant_and_number_legacy()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_negocios uuid[];
  v_match text[];
begin
  if new.negocio_id is null then
    select array_agg(nu.negocio_id order by nu.created_at)
      into v_negocios
    from public.negocio_usuarios nu
    where nu.user_id = auth.uid()
      and nu.is_active = true;

    if v_negocios is null or cardinality(v_negocios) = 0 then
      raise exception 'No active business membership for authenticated user';
    end if;

    if cardinality(v_negocios) > 1 then
      raise exception 'Multiple active business memberships; negocio_id is required';
    end if;

    new.negocio_id := v_negocios[1];
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
